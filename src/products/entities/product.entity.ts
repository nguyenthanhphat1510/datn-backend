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

  @Column({ type: 'double' })
  price: number;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
