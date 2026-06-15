import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateAddressDto {
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
  lat?: number; // Toạ độ (resolve từ gogoduk) — để tính phí ship theo khoảng cách

  @IsNumber()
  @IsOptional()
  lon?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean; // Đặt làm địa chỉ mặc định
}
