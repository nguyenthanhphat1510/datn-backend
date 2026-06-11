// src/orders/dto/create-order.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
}
