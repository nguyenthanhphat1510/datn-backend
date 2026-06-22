import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('diseases')
export class Disease {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  name: string; // VD "Đạo ôn lá"

  @Column()
  slug: string; // unique, lowercase, kebab-case

  // Danh sách triệu chứng — dùng để khớp với mô tả của người dùng ở nhánh trieu_chung
  @Column({ type: 'array', default: [] })
  symptoms: string[];

  @Column({ nullable: true })
  description: string; // Mô tả / nguyên nhân

  // Ref đến danh sách Product._id (thuốc gợi ý). Lưu dạng string như product.categoryId.
  @Column({ type: 'array', default: [] })
  recommendedProductIds: string[];

  // Ảnh minh họa lưu trên Cloudinary (cùng cấu trúc với Product.images)
  @Column({ type: 'array', default: [] })
  images: { url: string; publicId: string }[];

  // Vector embedding (gemini-embedding-001, 768 chiều) sinh từ name + symptoms +
  // description. Dùng cho Atlas Vector Search ở nhánh trieu_chung của chatbot.
  // Cập nhật mỗi khi tạo/sửa bệnh. Không trả về API công khai.
  @Column({ type: 'array', default: [] })
  embedding: number[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
