import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Product, ProductCategory } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export interface ProductFilter {
  category?: ProductCategory;
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
  ) {}

  /** Tạo sản phẩm mới */
  async create(createProductDto: CreateProductDto): Promise<Product> {
    const product = this.productsRepository.create(createProductDto);
    return this.productsRepository.save(product);
  }

  /** Lấy danh sách sản phẩm với filter và phân trang */
  async findAll(
    filter: ProductFilter = {},
    pagination: PaginationOptions = {},
  ): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
    const { category, isActive, search, minPrice, maxPrice } = filter;
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    // Build where condition
    const where: Record<string, any> = {};

    if (category) {
      where.category = category;
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

  /** Xóa cứng khỏi DB (chỉ dùng khi cần) */
  async remove(id: string): Promise<{ message: string }> {
    const product = await this.findOne(id);
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
}
