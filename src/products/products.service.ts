import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Product } from './entities/product.entity';
import { Disease } from '../diseases/entities/disease.entity';
import { Category } from '../categories/entities/category.entity';
import { Subcategory } from '../subcategories/entities/subcategory.entity';
import { Manufacturer } from '../manufacturers/entities/manufacturer.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { EmbeddingService } from '../common/embedding/embedding.service';

export interface ProductFilter {
  categoryId?: string;
  subcategoryId?: string;
  isActive?: boolean;
  search?: string;       // Tìm theo tên
  minPrice?: number;
  maxPrice?: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: MongoRepository<Product>,
    @InjectRepository(Disease)
    private diseasesRepository: MongoRepository<Disease>,
    @InjectRepository(Subcategory)
    private subcategoriesRepository: MongoRepository<Subcategory>,
    @InjectRepository(Category)
    private categoriesRepository: MongoRepository<Category>,
    @InjectRepository(Manufacturer)
    private manufacturersRepository: MongoRepository<Manufacturer>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Kiểm tra giá khuyến mãi hợp lệ: nếu có salePrice thì phải > 0 và < giá gốc.
   * @param salePrice giá khuyến mãi muốn áp (có thể null/undefined)
   * @param price giá gốc cuối cùng của sản phẩm
   */
  private validateSalePrice(
    salePrice: number | null | undefined,
    price: number,
  ): void {
    if (salePrice === null || salePrice === undefined) return;
    if (salePrice >= price) {
      throw new BadRequestException(
        'Giá khuyến mãi phải nhỏ hơn giá gốc',
      );
    }
  }

  /** Kiểm tra category hợp lệ: đúng định dạng, tồn tại và đang active. */
  private async validateCategory(categoryId: string): Promise<void> {
    if (!ObjectId.isValid(categoryId)) {
      throw new BadRequestException('categoryId không hợp lệ');
    }
    const category = await this.categoriesRepository.findOne({
      where: { _id: new ObjectId(categoryId) },
    });
    if (!category) {
      throw new NotFoundException(
        `Không tìm thấy danh mục với ID: ${categoryId}`,
      );
    }
    if (!category.isActive) {
      throw new BadRequestException('Danh mục đang bị ẩn');
    }
  }

  /** Kiểm tra nhà sản xuất hợp lệ: đúng định dạng, tồn tại và đang active. */
  private async validateManufacturer(manufacturerId: string): Promise<void> {
    if (!ObjectId.isValid(manufacturerId)) {
      throw new BadRequestException('manufacturer không hợp lệ');
    }
    const manufacturer = await this.manufacturersRepository.findOne({
      where: { _id: new ObjectId(manufacturerId) },
    });
    if (!manufacturer) {
      throw new NotFoundException(
        `Không tìm thấy nhà sản xuất với ID: ${manufacturerId}`,
      );
    }
    if (!manufacturer.isActive) {
      throw new BadRequestException('Nhà sản xuất đang bị ẩn');
    }
  }

  /**
   * Kiểm tra subcategory hợp lệ: tồn tại, đang active, và thuộc đúng category cha
   * (subcategory.categoryId === categoryId của sản phẩm). Chặn gán lệch cây phân loại.
   */
  private async validateSubcategory(
    subcategoryId: string,
    categoryId: string,
  ): Promise<void> {
    if (!ObjectId.isValid(subcategoryId)) {
      throw new BadRequestException('subcategoryId không hợp lệ');
    }
    const subcategory = await this.subcategoriesRepository.findOne({
      where: { _id: new ObjectId(subcategoryId) },
    });
    if (!subcategory) {
      throw new NotFoundException(
        `Không tìm thấy danh mục con với ID: ${subcategoryId}`,
      );
    }
    if (!subcategory.isActive) {
      throw new BadRequestException('Danh mục con đang bị ẩn');
    }
    if (subcategory.categoryId !== categoryId) {
      throw new BadRequestException(
        'Danh mục con không thuộc danh mục đã chọn',
      );
    }
  }

  /**
   * Tìm tên các bệnh mà sản phẩm này trị (lấy từ Disease.recommendedProductIds chứa
   * id của SP). Dùng để bồi ngữ nghĩa "trị bệnh gì" vào embedding của sản phẩm,
   * nhờ đó câu hỏi theo tên bệnh ("thuốc trị đạo ôn") match được dù tên SP không
   * chứa tên bệnh.
   */
  private async findRelatedDiseaseNames(productId: string): Promise<string[]> {
    try {
      const diseases = await this.diseasesRepository.find({
        where: { recommendedProductIds: productId } as any,
      });
      return diseases.map((d) => d.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Gộp các trường text + tên bệnh liên quan thành một đoạn để sinh embedding.
   * Đưa name + description + usageInstructions + tên bệnh trị vào cùng để vector
   * phản ánh đầy đủ "ngữ nghĩa" của sản phẩm (công dụng + trị bệnh gì).
   */
  private buildEmbeddingText(p: {
    name?: string;
    description?: string;
    usageInstructions?: string;
    ingredients?: string;
    diseaseNames?: string[];
  }): string {
    return [
      p.name,
      p.description,
      p.usageInstructions,
      p.ingredients,
      (p.diseaseNames ?? []).join('. '),
    ]
      .filter(Boolean)
      .join('. ')
      .trim();
  }

  /**
   * Sinh embedding cho sản phẩm. Bọc try/catch để lỗi embedding (vd hết quota)
   * KHÔNG chặn việc lưu sản phẩm — chỉ log cảnh báo, embedding để rỗng và có thể
   * tái tạo sau (qua reEmbed / backfill).
   */
  private async safeEmbed(text: string): Promise<number[]> {
    if (!text || !this.embeddingService.enabled) return [];
    try {
      return await this.embeddingService.embedDocument(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Products] Sinh embedding thất bại, lưu với vector rỗng: ${msg}`,
      );
      return [];
    }
  }

  /** Loại bỏ field embedding trước khi trả về API công khai (768 số, vô nghĩa với client). */
  private stripEmbedding(p: Product): Product {
    const { embedding: _embedding, ...rest } = p;
    return rest as Product;
  }

  /** Tạo sản phẩm mới */
  async create(createProductDto: CreateProductDto): Promise<Product> {
    this.validateSalePrice(createProductDto.salePrice, createProductDto.price);
    await this.validateCategory(createProductDto.categoryId);
    await this.validateSubcategory(
      createProductDto.subcategoryId,
      createProductDto.categoryId,
    );
    await this.validateManufacturer(createProductDto.manufacturer);

    // SP mới chưa có id nên chưa thể tra bệnh liên quan; embedding lúc này dựa trên
    // text của SP. Khi admin gắn SP vào bệnh, DiseasesService sẽ gọi reEmbed bổ sung.
    const embedding = await this.safeEmbed(
      this.buildEmbeddingText({
        name: createProductDto.name,
        description: createProductDto.description,
        usageInstructions: createProductDto.usageInstructions,
        ingredients: createProductDto.ingredients,
      }),
    );

    // TypeORM Mongo không áp @Column default cho field bị undefined → set explicit
    const product = this.productsRepository.create({
      ...createProductDto,
      salePrice: createProductDto.salePrice ?? null,
      isActive: createProductDto.isActive ?? true,
      embedding,
    });
    product.images = [];
    return this.stripEmbedding(await this.productsRepository.save(product));
  }

  /** Lấy danh sách sản phẩm với filter và phân trang */
  async findAll(
    filter: ProductFilter = {},
    pagination: PaginationOptions = {},
  ): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
    const { categoryId, subcategoryId, isActive, search, minPrice, maxPrice } =
      filter;
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    // Build where condition
    const where: Record<string, any> = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (subcategoryId) {
      where.subcategoryId = subcategoryId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.name = { $regex: search, $options: 'i' };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.$gte = minPrice;
      if (maxPrice !== undefined) where.price.$lte = maxPrice;
    }

    const [data, total] = await this.productsRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' } as any,
    });

    // Bỏ embedding khỏi response: nặng (768 số/SP) và vô nghĩa với client.
    return { data: data.map((p) => this.stripEmbedding(p)), total, page, limit };
  }

  /**
   * Lấy 1 sản phẩm theo ID — TRẢ NGUYÊN (có embedding). Dùng cho các service nội bộ
   * (cart, order, reviews...). Controller công khai dùng findOnePublic.
   */
  async findOne(id: string): Promise<Product> {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestException('ID sản phẩm không hợp lệ');
    }

    const product = await this.productsRepository.findOne({
      where: { _id: new ObjectId(id) },
    });

    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm với ID: ${id}`);
    }

    return product;
  }

  /** Như findOne nhưng đã bỏ embedding — dùng cho controller GET công khai. */
  async findOnePublic(id: string): Promise<Product> {
    return this.stripEmbedding(await this.findOne(id));
  }

  /** Cập nhật sản phẩm */
  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id); // sẽ throw nếu không tồn tại

    // Validate salePrice với giá gốc cuối cùng (sau khi merge thay đổi)
    const finalPrice = updateProductDto.price ?? product.price;
    const finalSalePrice =
      updateProductDto.salePrice !== undefined
        ? updateProductDto.salePrice
        : product.salePrice;
    this.validateSalePrice(finalSalePrice, finalPrice);

    // Nếu đổi danh mục thì kiểm tra danh mục mới tồn tại + active.
    if (updateProductDto.categoryId !== undefined) {
      await this.validateCategory(updateProductDto.categoryId);
    }

    // Nếu đổi danh mục hoặc danh mục con, kiểm tra lại cặp cuối cùng để subcategory
    // luôn thuộc đúng category cha (đồng thời kiểm subcategory tồn tại + active).
    if (
      updateProductDto.categoryId !== undefined ||
      updateProductDto.subcategoryId !== undefined
    ) {
      const finalCategoryId = updateProductDto.categoryId ?? product.categoryId;
      const finalSubcategoryId =
        updateProductDto.subcategoryId ?? product.subcategoryId;
      await this.validateSubcategory(finalSubcategoryId, finalCategoryId);
    }

    // Nếu đổi nhà sản xuất thì kiểm tra tồn tại + active.
    if (updateProductDto.manufacturer !== undefined) {
      await this.validateManufacturer(updateProductDto.manufacturer);
    }

    Object.assign(product, updateProductDto);

    // Chỉ sinh lại embedding khi đổi một trong các trường text cấu thành vector,
    // để tránh gọi API thừa (vd chỉ đổi giá/tồn kho thì không cần re-embed).
    const textChanged =
      updateProductDto.name !== undefined ||
      updateProductDto.description !== undefined ||
      updateProductDto.usageInstructions !== undefined ||
      updateProductDto.ingredients !== undefined;
    if (textChanged) {
      const diseaseNames = await this.findRelatedDiseaseNames(id);
      product.embedding = await this.safeEmbed(
        this.buildEmbeddingText({
          name: product.name,
          description: product.description,
          usageInstructions: product.usageInstructions,
          ingredients: product.ingredients,
          diseaseNames,
        }),
      );
    }

    return this.stripEmbedding(await this.productsRepository.save(product));
  }

  /**
   * Sinh lại embedding cho 1 sản phẩm theo dữ liệu hiện tại + tên bệnh liên quan.
   * DiseasesService gọi method này khi liên kết bệnh-thuốc (recommendedProductIds)
   * thay đổi, để embedding của SP luôn phản ánh đúng các bệnh nó trị.
   */
  async reEmbed(productId: string): Promise<void> {
    if (!ObjectId.isValid(productId)) return;
    const product = await this.productsRepository.findOne({
      where: { _id: new ObjectId(productId) },
    });
    if (!product) return;

    const diseaseNames = await this.findRelatedDiseaseNames(productId);
    product.embedding = await this.safeEmbed(
      this.buildEmbeddingText({
        name: product.name,
        description: product.description,
        usageInstructions: product.usageInstructions,
        ingredients: product.ingredients,
        diseaseNames,
      }),
    );
    await this.productsRepository.save(product);
  }

  /**
   * Backfill: sinh lại embedding cho TẤT CẢ sản phẩm hiện có. Chạy 1 lần sau khi
   * thêm tính năng vector search để các SP cũ (chưa có embedding) tìm được.
   */
  async reEmbedAll(): Promise<{ total: number; embedded: number }> {
    const products = await this.productsRepository.find();
    let embedded = 0;
    for (const product of products) {
      const diseaseNames = await this.findRelatedDiseaseNames(
        product._id.toString(),
      );
      const vector = await this.safeEmbed(
        this.buildEmbeddingText({
          name: product.name,
          description: product.description,
          usageInstructions: product.usageInstructions,
          ingredients: product.ingredients,
          diseaseNames,
        }),
      );
      product.embedding = vector;
      await this.productsRepository.save(product);
      if (vector.length) embedded++;
    }
    return { total: products.length, embedded };
  }

  /** Xóa mềm: set isActive = false */
  async softDelete(id: string): Promise<{ message: string }> {
    const product = await this.findOne(id);
    product.isActive = false;
    await this.productsRepository.save(product);
    return { message: 'Đã ẩn sản phẩm thành công' };
  }

  /** Xóa cứng khỏi DB (chỉ dùng khi cần) — cleanup luôn ảnh trên Cloudinary */
  async remove(id: string): Promise<{ message: string }> {
    const product = await this.findOne(id);
    if (product.images?.length) {
      await Promise.all(
        product.images.map((img) => this.cloudinaryService.deleteImage(img.publicId)),
      );
    }
    await this.productsRepository.remove(product);
    return { message: 'Đã xóa sản phẩm thành công' };
  }

  /** Restore sản phẩm đã ẩn */
  async restore(id: string): Promise<Product> {
    const product = await this.findOne(id);
    product.isActive = true;
    return this.productsRepository.save(product);
  }

  /**
   * Cập nhật điểm đánh giá trung bình + số lượng review của sản phẩm.
   * Được ReviewsService gọi mỗi khi review thêm/sửa/xóa (denormalize).
   */
  async setRating(
    id: string,
    averageRating: number,
    reviewCount: number,
  ): Promise<Product> {
    const product = await this.findOne(id);
    product.averageRating = averageRating;
    product.reviewCount = reviewCount;
    return this.productsRepository.save(product);
  }

  /** Cập nhật tồn kho */
  async updateStock(id: string, quantity: number): Promise<Product> {
    const product = await this.findOne(id);
    const newStock = product.stock + quantity;
    if (newStock < 0) {
      throw new BadRequestException('Tồn kho không đủ');
    }
    product.stock = newStock;
    return this.productsRepository.save(product);
  }

  /** Upload thêm 1 hoặc nhiều ảnh cho sản phẩm */
  async addImages(id: string, files: Express.Multer.File[]): Promise<Product> {
    if (!files?.length) {
      throw new BadRequestException('Chưa có file nào được upload');
    }
    const product = await this.findOne(id);
    const uploaded = await Promise.all(
      files.map((f) => this.cloudinaryService.uploadImage(f)),
    );
    product.images = [...(product.images ?? []), ...uploaded];
    return this.productsRepository.save(product);
  }

  /** Xóa 1 ảnh khỏi sản phẩm (và khỏi Cloudinary) */
  async removeImage(id: string, publicId: string): Promise<Product> {
    const product = await this.findOne(id);
    const existed = product.images?.some((img) => img.publicId === publicId);
    if (!existed) {
      throw new NotFoundException(`Không tìm thấy ảnh với publicId: ${publicId}`);
    }
    await this.cloudinaryService.deleteImage(publicId);
    product.images = product.images.filter((img) => img.publicId !== publicId);
    return this.productsRepository.save(product);
  }
}
