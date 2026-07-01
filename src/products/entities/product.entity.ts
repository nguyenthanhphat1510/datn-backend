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

  // Ref đến _id của Subcategory (thuộc về categoryId ở trên). nullable để
  // đọc được sản phẩm cũ chưa có subcategory; sản phẩm tạo/sửa mới bắt buộc có.
  @Column({ nullable: true })
  subcategoryId: string;

  // Ref đến Manufacturer._id (lưu dạng string giống categoryId)
  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  usageInstructions: string; // Hướng dẫn sử dụng

  // Thành phần / hoạt chất (chuỗi tự do). Với thuốc BVTV là hoạt chất + hàm lượng
  // (vd "Tricyclazole 75% WP"); với phân bón là công thức (vd "N 16% - P2O5 16% -
  // K2O 8%"). Không áp dụng thì để null. Được gộp vào embedding để câu hỏi theo
  // hoạt chất/công thức tìm đúng SP, và dùng cho chatbot trả lời/so sánh thành phần.
  @Column({ nullable: true })
  ingredients: string;

  // Danh sách ảnh sản phẩm lưu trên Cloudinary
  @Column({ type: 'array', default: [] })
  images: { url: string; publicId: string }[];

  @Column({ default: true })
  isActive: boolean;

  // Vector embedding (gemini-embedding-001, 768 chiều) sinh từ name + description +
  // usageInstructions + tên các bệnh mà sản phẩm này trị. Dùng cho Atlas Vector
  // Search ở nhánh san_pham của chatbot. Cập nhật khi tạo/sửa SP, hoặc khi liên kết
  // bệnh-thuốc (Disease.recommendedProductIds) thay đổi. Không trả về API công khai.
  @Column({ type: 'array', default: [] })
  embedding: number[];

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
