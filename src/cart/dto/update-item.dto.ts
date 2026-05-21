import { IsInt, Min } from 'class-validator';

export class UpdateItemDto {
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(0, { message: 'quantity không được âm' })
  quantity: number;
  // Min(0) — cho phép truyền 0 để xóa item (xử lý trong CartService.updateItem)
}
