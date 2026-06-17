import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('products')
export class Product {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  // Giá gốc (giá niêm yết)
  @Column({ type: 'double' })
  price: number;

  // Giá khuyến mãi (giá bán thực tế). null = không giảm giá.
  // Luôn nhỏ hơn price khi có giá trị.
  @Column({ type: 'double', nullable: true })
  salePrice: number | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  // Ref đến _id của Category (lưu dạng string để DTO dễ validate qua @IsMongoId)
  @Column()
  categoryId: string;

  // Ref đến Manufacturer._id (lưu dạng string giống categoryId)
  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  usageInstructions: string; // Hướng dẫn sử dụng

  // Danh sách ảnh sản phẩm lưu trên Cloudinary
  @Column({ type: 'array', default: [] })
  images: { url: string; publicId: string }[];

  @Column({ default: true })
  isActive: boolean;

  // Điểm đánh giá trung bình (0..5) — denormalize từ collection reviews để đọc nhanh
  @Column({ type: 'double', default: 0 })
  averageRating: number;

  // Số lượng đánh giá — cập nhật cùng averageRating mỗi khi review thêm/sửa/xóa
  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
