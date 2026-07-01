import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Một tin nhắn trong lịch sử hội thoại do frontend gửi lên. */
export class ChatMessageDto {
  @ApiProperty({
    enum: ['user', 'assistant'],
    example: 'user',
    description: 'Vai trò: "user" là người dùng, "assistant" là bot',
  })
  @IsIn(['user', 'assistant'], {
    message: 'role chỉ được là "user" hoặc "assistant"',
  })
  role: 'user' | 'assistant';

  @ApiProperty({
    example: 'Lúa của tôi bị vàng lá, nên làm gì?',
    description: 'Nội dung tin nhắn',
  })
  @IsString()
  @IsNotEmpty({ message: 'content không được để trống' })
  @MaxLength(4000, { message: 'content tối đa 4000 ký tự' })
  content: string;
}

export class ChatDto {
  @ApiProperty({
    type: [ChatMessageDto],
    description:
      'Toàn bộ lịch sử hội thoại (kể cả câu hỏi mới nhất ở cuối mảng). Backend không lưu, frontend gửi lại mỗi lần.',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'messages không được rỗng' })
  @ArrayMaxSize(30, { message: 'messages tối đa 30 tin nhắn' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiProperty({
    type: [String],
    required: false,
    description:
      'ID các sản phẩm đang hiển thị mà FE gửi kèm để bot SO SÁNH (nhánh so_sanh). Bỏ trống nếu không có.',
    example: ['665f1a2b3c4d5e6f7a8b9c0d'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'comparedProductIds tối đa 10 sản phẩm' })
  @IsMongoId({ each: true, message: 'comparedProductIds phải là danh sách ID hợp lệ' })
  comparedProductIds?: string[];
}
