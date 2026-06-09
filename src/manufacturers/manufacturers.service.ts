import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Manufacturer } from './entities/manufacturer.entity';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { Product } from '../products/entities/product.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

/** Sinh slug từ tên tiếng Việt: "Công ty Bayer" -> "cong-ty-bayer" */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class ManufacturersService {
  constructor(
    @InjectRepository(Manufacturer)
    private manufacturersRepository: MongoRepository<Manufacturer>,
    @InjectRepository(Product)
    private productsRepository: MongoRepository<Product>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(dto: CreateManufacturerDto): Promise<Manufacturer> {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Không thể sinh slug từ tên');
    }

    const existed = await this.manufacturersRepository.findOne({ where: { slug } });
    if (existed) {
      throw new ConflictException(`Slug "${slug}" đã tồn tại`);
    }

    const manufacturer = this.manufacturersRepository.create({
      ...dto,
      slug,
      isActive: dto.isActive ?? true,
      logo: null,
    });
    return this.manufacturersRepository.save(manufacturer);
  }

  async findAll(includeInactive = false): Promise<Manufacturer[]> {
    const where = includeInactive ? {} : { isActive: true };
    return this.manufacturersRepository.find({
      where,
      order: { name: 'ASC' } as any,
    });
  }

  async findOne(id: string): Promise<Manufacturer> {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestException('ID nhà sản xuất không hợp lệ');
    }
    const manufacturer = await this.manufacturersRepository.findOne({
      where: { _id: new ObjectId(id) },
    });
    if (!manufacturer) {
      throw new NotFoundException(`Không tìm thấy nhà sản xuất với ID: ${id}`);
    }
    return manufacturer;
  }

  async findBySlug(slug: string): Promise<Manufacturer> {
    const manufacturer = await this.manufacturersRepository.findOne({ where: { slug } });
    if (!manufacturer) {
      throw new NotFoundException(`Không tìm thấy nhà sản xuất với slug: ${slug}`);
    }
    return manufacturer;
  }

  async update(id: string, dto: UpdateManufacturerDto): Promise<Manufacturer> {
    const manufacturer = await this.findOne(id);

    if (dto.slug && dto.slug !== manufacturer.slug) {
      const dup = await this.manufacturersRepository.findOne({
        where: { slug: dto.slug },
      });
      if (dup) {
        throw new ConflictException(`Slug "${dto.slug}" đã tồn tại`);
      }
    }

    Object.assign(manufacturer, dto);
    return this.manufacturersRepository.save(manufacturer);
  }

  async softDelete(id: string): Promise<{ message: string }> {
    const manufacturer = await this.findOne(id);
    manufacturer.isActive = false;
    await this.manufacturersRepository.save(manufacturer);
    return { message: 'Đã ẩn nhà sản xuất thành công' };
  }

  async restore(id: string): Promise<Manufacturer> {
    const manufacturer = await this.findOne(id);
    manufacturer.isActive = true;
    return this.manufacturersRepository.save(manufacturer);
  }

  /** Xóa cứng — chặn nếu còn sản phẩm liên kết */
  async remove(id: string): Promise<{ message: string }> {
    const manufacturer = await this.findOne(id);
    const count = await this.productsRepository.count({ manufacturer: id } as any);
    if (count > 0) {
      throw new BadRequestException(
        `Còn ${count} sản phẩm thuộc nhà sản xuất này, hãy chuyển sản phẩm sang nhà sản xuất khác trước`,
      );
    }
    if (manufacturer.logo?.publicId) {
      await this.cloudinaryService.deleteImage(manufacturer.logo.publicId);
    }
    await this.manufacturersRepository.remove(manufacturer);
    return { message: 'Đã xóa nhà sản xuất thành công' };
  }

  /** Upload/thay logo */
  async setLogo(id: string, file: Express.Multer.File): Promise<Manufacturer> {
    if (!file) {
      throw new BadRequestException('Chưa có file nào được upload');
    }
    const manufacturer = await this.findOne(id);
    const uploaded = await this.cloudinaryService.uploadImage(file, 'datn/manufacturers');
    if (manufacturer.logo?.publicId) {
      await this.cloudinaryService.deleteImage(manufacturer.logo.publicId);
    }
    manufacturer.logo = uploaded;
    return this.manufacturersRepository.save(manufacturer);
  }

  async removeLogo(id: string): Promise<Manufacturer> {
    const manufacturer = await this.findOne(id);
    if (manufacturer.logo?.publicId) {
      await this.cloudinaryService.deleteImage(manufacturer.logo.publicId);
    }
    manufacturer.logo = null;
    return this.manufacturersRepository.save(manufacturer);
  }
}
