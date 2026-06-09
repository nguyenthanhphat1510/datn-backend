import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('addresses') // Prefix: /addresses
// Không có @Public() → toàn bộ route yêu cầu JWT (JwtAuthGuard global).
// Địa chỉ là dữ liệu riêng theo user nên luôn cần xác thực.
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  /** GET /addresses — danh sách địa chỉ của user đang đăng nhập. */
  @Get()
  findAll(@CurrentUser() user: { userId: string }) {
    return this.addressesService.findAllByUser(user.userId);
  }

  /** GET /addresses/:id — chi tiết 1 địa chỉ (chỉ của chính mình). */
  @Get(':id')
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.addressesService.findOneOwned(user.userId, id);
  }

  /** POST /addresses — thêm địa chỉ mới. */
  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.create(user.userId, dto);
  }

  /** PATCH /addresses/:id — cập nhật địa chỉ. */
  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user.userId, id, dto);
  }

  /** PATCH /addresses/:id/default — đặt làm địa chỉ mặc định. */
  @HttpCode(HttpStatus.OK)
  @Patch(':id/default')
  setDefault(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.addressesService.setDefault(user.userId, id);
  }

  /** DELETE /addresses/:id — xóa địa chỉ. */
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.addressesService.remove(user.userId, id);
  }
}
