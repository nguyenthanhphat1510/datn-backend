import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export interface ProductFilter {
  categoryId?: string;
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
    private readonly cloudinaryService: CloudinaryService,
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

  /** Tạo sản phẩm mới */
  async create(createProductDto: CreateProductDto): Promise<Product> {
    this.validateSalePrice(createProductDto.salePrice, createProductDto.price);

    // TypeORM Mongo không áp @Column default cho field bị undefined → set explicit
    const product = this.productsRepository.create({
      ...createProductDto,
      salePrice: createProductDto.salePrice ?? null,
      isActive: createProductDto.isActive ?? true,
    });
    product.images = [];
    return this.productsRepository.save(product);
  }

  /** Lấy danh sách sản phẩm với filter và phân trang */
  async findAll(
    filter: ProductFilter = {},
    pagination: PaginationOptions = {},
  ): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
    const { categoryId, isActive, search, minPrice, maxPrice } = filter;
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    // Build where condition
    const where: Record<string, any> = {};

    if (categoryId) {
      where.categoryId = categoryId;
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

    return { data, total, page, limit };
  }

  /** Lấy 1 sản phẩm theo ID */
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

    Object.assign(product, updateProductDto);
    return this.productsRepository.save(product);
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
