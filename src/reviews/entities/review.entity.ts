// src/reviews/entities/review.entity.ts

import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('reviews')
export class Review {
  @ObjectIdColumn()
  _id: ObjectId;

  // Ref đến Product._id (lưu string giống các entity khác để DTO validate qua @IsMongoId)
  @Column()
  productId: string;

  // Ref đến Order._id — đánh giá gắn theo từng đơn (mua lại đơn khác = đánh giá mới).
  // Bộ (orderId, productId) là duy nhất cho mỗi user.
  @Column()
  orderId: string;

  // Ref đến User._id
  @Column()
  userId: string;

  // Snapshot tên người đánh giá tại thời điểm tạo (khỏi join sang User khi hiển thị)
  @Column()
  userName: string;

  // Số sao 1..5
  @Column({ type: 'int' })
  rating: number;

  @Column({ nullable: true })
  comment: string;

  // Ảnh đính kèm — dùng đúng shape ảnh của Product (Cloudinary)
  @Column({ type: 'array', default: [] })
  images: { url: string; publicId: string }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
