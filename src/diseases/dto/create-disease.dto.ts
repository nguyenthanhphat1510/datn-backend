import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsMongoId,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateDiseaseDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên bệnh không được để trống' })
  @MinLength(1)
  @MaxLength(100, { message: 'Tên bệnh tối đa 100 ký tự' })
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug chỉ chứa chữ thường, số và dấu gạch ngang',
  })
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'recommendedProductIds phải là danh sách ID hợp lệ' })
  recommendedProductIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
