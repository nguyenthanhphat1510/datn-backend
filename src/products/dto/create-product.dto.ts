import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsBoolean,
  IsMongoId,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @MaxLength(200, { message: 'Tên sản phẩm tối đa 200 ký tự' })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({}, { message: 'Giá phải là số' })
  @Min(0, { message: 'Giá không được âm' })
  price: number;

  // Giá khuyến mãi (tùy chọn). Bỏ trống = không giảm giá.
  // Phải nhỏ hơn giá gốc.
  @IsOptional()
  @ValidateIf((o) => o.salePrice !== null && o.salePrice !== undefined)
  @IsNumber({}, { message: 'Giá khuyến mãi phải là số' })
  @Min(0, { message: 'Giá khuyến mãi không được âm' })
  salePrice?: number | null;

  @IsInt({ message: 'Tồn kho phải là số nguyên' })
  @Min(0, { message: 'Tồn kho không được âm' })
  stock: number;

  // Ref đến Category._id (chuỗi ObjectId hợp lệ)
  @IsString()
  @IsNotEmpty({ message: 'Hãy chọn danh mục' })
  @IsMongoId({ message: 'categoryId không hợp lệ' })
  categoryId: string;

  // Ref đến Manufacturer._id (chuỗi ObjectId hợp lệ)
  @IsOptional()
  @IsMongoId({ message: 'manufacturer không hợp lệ' })
  manufacturer?: string;

  @IsOptional()
  @IsString()
  usageInstructions?: string;

  // Ảnh sản phẩm upload qua endpoint POST /products/:id/images sau khi tạo

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
