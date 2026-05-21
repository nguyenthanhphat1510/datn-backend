import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Subcategory } from './entities/subcategory.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface SubcategoryFilter {
  categoryId?: string;
  includeInactive?: boolean;
}

@Injectable()
export class SubcategoriesService {
  constructor(
    @InjectRepository(Subcategory)
    private subcategoriesRepository: MongoRepository<Subcategory>,
    @InjectRepository(Category)
    private categoriesRepository: MongoRepository<Category>,
  ) {}

  private async validateCategory(categoryId: string): Promise<void> {
    if (!ObjectId.isValid(categoryId)) {
      throw new BadRequestException('categoryId không hợp lệ');
    }
    const category = await this.categoriesRepository.findOne({
      where: { _id: new ObjectId(categoryId) },
    });
    if (!category) {
      throw new NotFoundException(`Không tìm thấy danh mục cha với ID: ${categoryId}`);
    }
  }

  async create(dto: CreateSubcategoryDto): Promise<Subcategory> {
    await this.validateCategory(dto.categoryId);

    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Không thể sinh slug từ tên');
    }

    const existed = await this.subcategoriesRepository.findOne({ where: { slug } });
    if (existed) {
      throw new ConflictException(`Slug "${slug}" đã tồn tại`);
    }

    const subcategory = this.subcategoriesRepository.create({
      ...dto,
      slug,
      isActive: dto.isActive ?? true,
    });
    return this.subcategoriesRepository.save(subcategory);
  }

  async findAll(filter: SubcategoryFilter = {}): Promise<Subcategory[]> {
    const where: Record<string, any> = {};
    if (!filter.includeInactive) where.isActive = true;
    if (filter.categoryId) where.categoryId = filter.categoryId;

    return this.subcategoriesRepository.find({
      where,
      order: { name: 'ASC' } as any,
    });
  }

  async findOne(id: string): Promise<Subcategory> {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestException('ID danh mục con không hợp lệ');
    }
    const subcategory = await this.subcategoriesRepository.findOne({
      where: { _id: new ObjectId(id) },
    });
    if (!subcategory) {
      throw new NotFoundException(`Không tìm thấy danh mục con với ID: ${id}`);
    }
    return subcategory;
  }

  async update(id: string, dto: UpdateSubcategoryDto): Promise<Subcategory> {
    const subcategory = await this.findOne(id);

    if (dto.categoryId && dto.categoryId !== subcategory.categoryId) {
      await this.validateCategory(dto.categoryId);
    }

    if (dto.slug && dto.slug !== subcategory.slug) {
      const dup = await this.subcategoriesRepository.findOne({
        where: { slug: dto.slug },
      });
      if (dup) {
        throw new ConflictException(`Slug "${dto.slug}" đã tồn tại`);
      }
    }

    Object.assign(subcategory, dto);
    return this.subcategoriesRepository.save(subcategory);
  }

  async softDelete(id: string): Promise<{ message: string }> {
    const subcategory = await this.findOne(id);
    subcategory.isActive = false;
    await this.subcategoriesRepository.save(subcategory);
    return { message: 'Đã ẩn danh mục con thành công' };
  }

  async restore(id: string): Promise<Subcategory> {
    const subcategory = await this.findOne(id);
    subcategory.isActive = true;
    return this.subcategoriesRepository.save(subcategory);
  }

  async remove(id: string): Promise<{ message: string }> {
    const subcategory = await this.findOne(id);
    await this.subcategoriesRepository.remove(subcategory);
    return { message: 'Đã xóa danh mục con thành công' };
  }
}
