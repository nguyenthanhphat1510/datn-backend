// src/orders/dto/create-order.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  IsNumber,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../entities/order.entity';

// DTO cho địa chỉ giao hàng — dùng @ValidateNested để validate nested object
export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty({ message: 'Họ tên người nhận không được để trống' })
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  address: string;

  @IsNumber()
  @IsOptional()
  lat?: number; // Toạ độ resolve từ gogoduk — để tính phí ship

  @IsNumber()
  @IsOptional()
  lon?: number;
}

export class CreateOrderDto {
  // Cách 1 (ưu tiên): chọn địa chỉ từ sổ địa chỉ đã lưu
  @IsMongoId({ message: 'addressId không hợp lệ' })
  @IsOptional()
  addressId?: string;

  // Cách 2: nhập địa chỉ trực tiếp (dùng khi không chọn từ sổ)
  // @ValidateNested() + @Type(() => ...) để validate object lồng nhau
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsOptional()
  shippingAddress?: ShippingAddressDto;

  @IsString()
  @IsOptional()
  note?: string; // Ghi chú không bắt buộc

  // Phương thức thanh toán — mặc định COD nếu không gửi (tương thích ngược)
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  @IsOptional()
  paymentMethod?: PaymentMethod;
}
