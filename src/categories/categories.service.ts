import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Product } from '../products/entities/product.entity';

/** Sinh slug từ tên tiếng Việt: "Phân bón" -> "phan-bon" */
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
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: MongoRepository<Category>,
    @InjectRepository(Product)
    private productsRepository: MongoRepository<Product>,
  ) {}

  /** Tạo danh mục mới */
  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Không thể sinh slug từ tên');
    }

    const existed = await this.categoriesRepository.findOne({ where: { slug } });
    if (existed) {
      throw new ConflictException(`Slug "${slug}" đã tồn tại`);
    }

    const category = this.categoriesRepository.create({
      ...dto,
      slug,
      isActive: dto.isActive ?? true,
    });
    return this.categoriesRepository.save(category);
  }

  /** Lấy danh sách */
  async findAll(includeInactive = false): Promise<Category[]> {
    const where = includeInactive ? {} : { isActive: true };
    return this.categoriesRepository.find({
      where,
      order: { name: 'ASC' } as any,
    });
  }

  /** Lấy 1 theo ID */
  async findOne(id: string): Promise<Category> {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestException('ID danh mục không hợp lệ');
    }
    const category = await this.categoriesRepository.findOne({
      where: { _id: new ObjectId(id) },
    });
    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục với ID: ${id}`);
    }
    return category;
  }

  /** Lấy 1 theo slug — cho FE storefront */
  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục với slug: ${slug}`);
    }
    return category;
  }

  /** Cập nhật danh mục */
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    // Nếu đổi slug, check unique
    if (dto.slug && dto.slug !== category.slug) {
      const dup = await this.categoriesRepository.findOne({
        where: { slug: dto.slug },
      });
      if (dup) {
        throw new ConflictException(`Slug "${dto.slug}" đã tồn tại`);
      }
    }

    Object.assign(category, dto);
    return this.categoriesRepository.save(category);
  }

  /** Ẩn (soft delete) */
  async softDelete(id: string): Promise<{ message: string }> {
    const category = await this.findOne(id);
    category.isActive = false;
    await this.categoriesRepository.save(category);
    return { message: 'Đã ẩn danh mục thành công' };
  }

  /** Khôi phục */
  async restore(id: string): Promise<Category> {
    const category = await this.findOne(id);
    category.isActive = true;
    return this.categoriesRepository.save(category);
  }

  /** Xóa cứng — chặn nếu còn sản phẩm liên kết */
  async remove(id: string): Promise<{ message: string }> {
    const category = await this.findOne(id);
    const count = await this.productsRepository.count({ categoryId: id } as any);
    if (count > 0) {
      throw new BadRequestException(
        `Còn ${count} sản phẩm trong danh mục, hãy chuyển sản phẩm sang danh mục khác trước`,
      );
    }
    await this.categoriesRepository.remove(category);
    return { message: 'Đã xóa danh mục thành công' };
  }
}
