import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Disease } from './entities/disease.entity';
import { CreateDiseaseDto } from './dto/create-disease.dto';
import { UpdateDiseaseDto } from './dto/update-disease.dto';
import { EmbeddingService } from '../common/embedding/embedding.service';
import { ProductsService } from '../products/products.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

/** Sinh slug từ tên tiếng Việt: "Đạo ôn lá" -> "dao-on-la" */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD') // tách dấu khỏi ký tự
    .replace(/[̀-ͯ]/g, '') // xóa combining diacritical marks
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-') // ký tự không hợp lệ → dấu gạch
    .replace(/^-|-$/g, ''); // bỏ gạch đầu/cuối
}

@Injectable()
export class DiseasesService {
  constructor(
    @InjectRepository(Disease)
    private diseasesRepository: MongoRepository<Disease>,
    private readonly embeddingService: EmbeddingService,
    private readonly productsService: ProductsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Khi liên kết bệnh-thuốc đổi, embedding của các SP được thêm/bỏ phải sinh lại
   * để phản ánh đúng "trị bệnh gì". Re-embed phần đối xứng (SP có ở list này nhưng
   * không có ở list kia). Bọc try/catch để lỗi đồng bộ không chặn việc lưu bệnh.
   */
  private async syncProductEmbeddings(
    oldIds: string[],
    newIds: string[],
  ): Promise<void> {
    const oldSet = new Set(oldIds);
    const newSet = new Set(newIds);
    const affected = [
      ...newIds.filter((id) => !oldSet.has(id)), // SP mới được gắn
      ...oldIds.filter((id) => !newSet.has(id)), // SP bị bỏ ra
    ];
    for (const productId of affected) {
      try {
        await this.productsService.reEmbed(productId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[Diseases] Đồng bộ embedding SP ${productId} thất bại: ${msg}`,
        );
      }
    }
  }

  /**
   * Gộp các trường text thành một đoạn để sinh embedding. Đưa name + symptoms +
   * description vào cùng để vector phản ánh đầy đủ "ngữ nghĩa" của bệnh.
   */
  private buildEmbeddingText(d: {
    name?: string;
    symptoms?: string[];
    description?: string;
  }): string {
    return [d.name, (d.symptoms ?? []).join('. '), d.description]
      .filter(Boolean)
      .join('. ')
      .trim();
  }

  /**
   * Sinh embedding cho bệnh. Bọc try/catch để lỗi embedding (vd hết quota) KHÔNG
   * chặn việc lưu bệnh — chỉ log cảnh báo, embedding để rỗng và có thể tái tạo sau.
   */
  private async safeEmbed(text: string): Promise<number[]> {
    if (!text || !this.embeddingService.enabled) return [];
    try {
      return await this.embeddingService.embedDocument(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Không ném lỗi: ưu tiên lưu được bệnh; embedding có thể sinh lại sau.
      console.warn(`[Diseases] Sinh embedding thất bại, lưu với vector rỗng: ${msg}`);
      return [];
    }
  }

  /** Tạo bệnh mới */
  async create(dto: CreateDiseaseDto): Promise<Disease> {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Không thể sinh slug từ tên');
    }

    const existed = await this.diseasesRepository.findOne({ where: { slug } });
    if (existed) {
      throw new ConflictException(`Slug "${slug}" đã tồn tại`);
    }

    const symptoms = dto.symptoms ?? [];
    const embedding = await this.safeEmbed(
      this.buildEmbeddingText({ name: dto.name, symptoms, description: dto.description }),
    );

    const recommendedProductIds = dto.recommendedProductIds ?? [];
    const disease = this.diseasesRepository.create({
      ...dto,
      slug,
      symptoms,
      recommendedProductIds,
      isActive: dto.isActive ?? true,
      embedding,
    });
    const saved = await this.diseasesRepository.save(disease);

    // SP vừa được gắn vào bệnh mới này → re-embed để vector SP có tên bệnh.
    await this.syncProductEmbeddings([], recommendedProductIds);

    return this.stripEmbedding(saved);
  }

  /** Lấy danh sách */
  async findAll(includeInactive = false): Promise<Disease[]> {
    const where = includeInactive ? {} : { isActive: true };
    const list = await this.diseasesRepository.find({
      where,
      order: { name: 'ASC' } as any,
    });
    // Bỏ embedding khỏi response: nặng (768 số/bệnh) và vô nghĩa với client.
    return list.map((d) => this.stripEmbedding(d));
  }

  /** Loại bỏ field embedding trước khi trả về API công khai. */
  private stripEmbedding(d: Disease): Disease {
    const { embedding: _embedding, ...rest } = d;
    return rest as Disease;
  }

  /** Lấy 1 theo ID */
  async findOne(id: string): Promise<Disease> {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestException('ID bệnh không hợp lệ');
    }
    const disease = await this.diseasesRepository.findOne({
      where: { _id: new ObjectId(id) },
    });
    if (!disease) {
      throw new NotFoundException(`Không tìm thấy bệnh với ID: ${id}`);
    }
    return disease;
  }

  /** Như findOne nhưng đã bỏ embedding — dùng cho controller GET công khai. */
  async findOnePublic(id: string): Promise<Disease> {
    return this.stripEmbedding(await this.findOne(id));
  }

  /** Lấy 1 theo slug — cho FE storefront */
  async findBySlug(slug: string): Promise<Disease> {
    const disease = await this.diseasesRepository.findOne({ where: { slug } });
    if (!disease) {
      throw new NotFoundException(`Không tìm thấy bệnh với slug: ${slug}`);
    }
    return disease;
  }

  /** Như findBySlug nhưng đã bỏ embedding — dùng khi map kết quả dự đoán cho client. */
  async findBySlugPublic(slug: string): Promise<Disease> {
    return this.stripEmbedding(await this.findBySlug(slug));
  }

  /** Cập nhật bệnh */
  async update(id: string, dto: UpdateDiseaseDto): Promise<Disease> {
    const disease = await this.findOne(id);

    // Nếu đổi slug, check unique
    if (dto.slug && dto.slug !== disease.slug) {
      const dup = await this.diseasesRepository.findOne({
        where: { slug: dto.slug },
      });
      if (dup) {
        throw new ConflictException(`Slug "${dto.slug}" đã tồn tại`);
      }
    }

    // Giữ list SP gợi ý CŨ trước khi Object.assign ghi đè, để diff đồng bộ embedding.
    const oldProductIds = [...(disease.recommendedProductIds ?? [])];

    Object.assign(disease, dto);

    // Chỉ sinh lại embedding khi đổi một trong các trường text cấu thành vector,
    // để tránh gọi API thừa (vd chỉ bật/tắt isActive thì không cần re-embed).
    const textChanged =
      dto.name !== undefined ||
      dto.symptoms !== undefined ||
      dto.description !== undefined;
    if (textChanged) {
      disease.embedding = await this.safeEmbed(
        this.buildEmbeddingText({
          name: disease.name,
          symptoms: disease.symptoms,
          description: disease.description,
        }),
      );
    }

    const saved = await this.diseasesRepository.save(disease);

    // Nếu danh sách SP gợi ý đổi, re-embed các SP được thêm/bỏ để vector SP cập
    // nhật tên bệnh. Ngoài ra nếu chỉ TÊN bệnh đổi, các SP đang gắn cũng cần cập
    // nhật (vì embedding SP chứa tên bệnh) → re-embed toàn bộ SP đang gắn.
    if (dto.recommendedProductIds !== undefined) {
      await this.syncProductEmbeddings(oldProductIds, disease.recommendedProductIds);
    } else if (dto.name !== undefined) {
      await this.syncProductEmbeddings([], disease.recommendedProductIds ?? []);
    }

    return this.stripEmbedding(saved);
  }

  /** Ẩn (soft delete) */
  async softDelete(id: string): Promise<{ message: string }> {
    const disease = await this.findOne(id);
    disease.isActive = false;
    await this.diseasesRepository.save(disease);
    return { message: 'Đã ẩn bệnh thành công' };
  }

  /** Khôi phục */
  async restore(id: string): Promise<Disease> {
    const disease = await this.findOne(id);
    disease.isActive = true;
    return this.stripEmbedding(await this.diseasesRepository.save(disease));
  }

  /** Xóa cứng — dọn cả ảnh trên Cloudinary */
  async remove(id: string): Promise<{ message: string }> {
    const disease = await this.findOne(id);
    if (disease.images?.length) {
      await Promise.all(
        disease.images.map((img) =>
          this.cloudinaryService.deleteImage(img.publicId),
        ),
      );
    }
    await this.diseasesRepository.remove(disease);
    return { message: 'Đã xóa bệnh thành công' };
  }

  /** Upload thêm 1 hoặc nhiều ảnh minh họa cho bệnh */
  async addImages(id: string, files: Express.Multer.File[]): Promise<Disease> {
    if (!files?.length) {
      throw new BadRequestException('Chưa có file nào được upload');
    }
    const disease = await this.findOne(id);
    const uploaded = await Promise.all(
      files.map((f) => this.cloudinaryService.uploadImage(f, 'datn/diseases')),
    );
    disease.images = [...(disease.images ?? []), ...uploaded];
    return this.stripEmbedding(await this.diseasesRepository.save(disease));
  }

  /** Xóa 1 ảnh khỏi bệnh (và khỏi Cloudinary) */
  async removeImage(id: string, publicId: string): Promise<Disease> {
    const disease = await this.findOne(id);
    const existed = disease.images?.some((img) => img.publicId === publicId);
    if (!existed) {
      throw new NotFoundException(`Không tìm thấy ảnh với publicId: ${publicId}`);
    }
    await this.cloudinaryService.deleteImage(publicId);
    disease.images = disease.images.filter((img) => img.publicId !== publicId);
    return this.stripEmbedding(await this.diseasesRepository.save(disease));
  }
}
