import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';

export class AddItemDto {
  @IsString()
  @IsNotEmpty({ message: 'productId không được để trống' })
  productId: string;

  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity tối thiểu là 1' })
  quantity: number;
}
