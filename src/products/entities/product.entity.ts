import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export enum ProductCategory {
  THUOC_BVTV = 'thuoc_bvtv',       // Thuốc bảo vệ thực vật
  PHAN_BON = 'phan_bon',           // Phân bón
  GIONG = 'giong',                 // Giống cây trồng
  CONG_CU = 'cong_cu',             // Công cụ nông nghiệp
  KHAC = 'khac',                   // Khác
}

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

  @Column({
    type: 'enum',
    enum: ProductCategory,
    default: ProductCategory.KHAC,
  })
  category: ProductCategory;

  @Column({ nullable: true })
  manufacturer: string; // Nhà sản xuất / thương hiệu

  @Column({ nullable: true })
  usageInstructions: string; // Hướng dẫn sử dụng

  // Trường image_url để sau tích hợp Cloudinary
  @Column({ nullable: true })
  imageUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
