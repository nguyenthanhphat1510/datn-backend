import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private addressesRepository: MongoRepository<Address>,
  ) {}

  /**
   * Gỡ cờ isDefault của tất cả địa chỉ thuộc user (trừ exceptId nếu có).
   * Đảm bảo quy tắc "chỉ 1 địa chỉ mặc định / user".
   */
  private async unsetOthers(userId: string, exceptId?: ObjectId): Promise<void> {
    const filter: Record<string, unknown> = { userId, isDefault: true };
    if (exceptId) {
      filter._id = { $ne: exceptId };
    }
    await this.addressesRepository.updateMany(filter, {
      $set: { isDefault: false },
    });
  }

  /** POST /addresses — tạo địa chỉ mới cho user. */
  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const count = await this.addressesRepository.count({ userId } as any);
    // Địa chỉ đầu tiên luôn là mặc định; hoặc khi client yêu cầu isDefault
    const makeDefault = count === 0 || dto.isDefault === true;

    if (makeDefault) {
      await this.unsetOthers(userId);
    }

    const address = this.addressesRepository.create({
      userId,
      fullName: dto.fullName,
      phone: dto.phone,
      address: dto.address,
      lat: dto.lat,
      lon: dto.lon,
      isDefault: makeDefault,
    });
    return this.addressesRepository.save(address);
  }

  /** GET /addresses — danh sách địa chỉ của user, mặc định lên đầu. */
  async findAllByUser(userId: string): Promise<Address[]> {
    return this.addressesRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' } as any,
    });
  }

  /**
   * Tìm 1 địa chỉ và chặn nếu không thuộc về user (tránh xem địa chỉ người khác).
   * Dùng chung cho getById/update/setDefault/remove.
   */
  async findOneOwned(userId: string, id: string): Promise<Address> {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestException('ID địa chỉ không hợp lệ');
    }

    const address = await this.addressesRepository.findOne({
      where: { _id: new ObjectId(id) },
    });

    if (!address) {
      throw new NotFoundException(`Không tìm thấy địa chỉ với ID: ${id}`);
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập địa chỉ này');
    }

    return address;
  }

  /** PATCH /addresses/:id — cập nhật địa chỉ. */
  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const address = await this.findOneOwned(userId, id);

    // Nếu set isDefault=true → gỡ cờ các địa chỉ khác trước
    if (dto.isDefault === true) {
      await this.unsetOthers(userId, address._id);
    }

    Object.assign(address, dto);
    return this.addressesRepository.save(address);
  }

  /** PATCH /addresses/:id/default — đặt làm địa chỉ mặc định. */
  async setDefault(userId: string, id: string): Promise<Address> {
    const address = await this.findOneOwned(userId, id);
    await this.unsetOthers(userId, address._id);
    address.isDefault = true;
    return this.addressesRepository.save(address);
  }

  /** DELETE /addresses/:id — xóa địa chỉ. */
  async remove(userId: string, id: string): Promise<{ message: string }> {
    const address = await this.findOneOwned(userId, id);
    const wasDefault = address.isDefault;

    await this.addressesRepository.remove(address);

    // Nếu xóa đúng cái mặc định và còn địa chỉ khác → promote 1 cái làm mặc định
    if (wasDefault) {
      const remaining = await this.addressesRepository.findOne({
        where: { userId },
        order: { createdAt: 'DESC' } as any,
      });
      if (remaining) {
        remaining.isDefault = true;
        await this.addressesRepository.save(remaining);
      }
    }

    return { message: 'Đã xóa địa chỉ thành công' };
  }
}
