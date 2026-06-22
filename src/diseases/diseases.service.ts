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
  ) {}

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

    const disease = this.diseasesRepository.create({
      ...dto,
      slug,
      symptoms,
      recommendedProductIds: dto.recommendedProductIds ?? [],
      isActive: dto.isActive ?? true,
      embedding,
    });
    return this.stripEmbedding(await this.diseasesRepository.save(disease));
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

    return this.stripEmbedding(await this.diseasesRepository.save(disease));
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

  /** Xóa cứng */
  async remove(id: string): Promise<{ message: string }> {
    const disease = await this.findOne(id);
    await this.diseasesRepository.remove(disease);
    return { message: 'Đã xóa bệnh thành công' };
  }
}
