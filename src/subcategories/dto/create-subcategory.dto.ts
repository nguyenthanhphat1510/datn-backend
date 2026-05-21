import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateSubcategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục con không được để trống' })
  @MaxLength(100, { message: 'Tên tối đa 100 ký tự' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Danh mục cha không được để trống' })
  categoryId: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug chỉ chứa chữ thường, số và dấu gạch ngang',
  })
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
