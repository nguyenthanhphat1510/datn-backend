import {
  IsString,
  IsInt,
  IsOptional,
  IsMongoId,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  // Ref đến Product._id (chuỗi ObjectId hợp lệ)
  @IsString()
  @IsMongoId({ message: 'productId không hợp lệ' })
  productId: string;

  // Ref đến Order._id — đánh giá cho sản phẩm trong đúng đơn này
  @IsString()
  @IsMongoId({ message: 'orderId không hợp lệ' })
  orderId: string;

  // Số sao 1..5
  @IsInt({ message: 'Số sao phải là số nguyên' })
  @Min(1, { message: 'Số sao tối thiểu là 1' })
  @Max(5, { message: 'Số sao tối đa là 5' })
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Bình luận tối đa 1000 ký tự' })
  comment?: string;

  // Ảnh upload qua endpoint POST /reviews/:id/images sau khi tạo
}
