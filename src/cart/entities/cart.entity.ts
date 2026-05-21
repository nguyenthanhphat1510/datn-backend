import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

// Interface định nghĩa shape của mỗi item trong giỏ
// Là plain interface (không phải @Entity) vì nó là embedded document trong Cart
export interface CartItem {
  productId: string; // ObjectId của Product, lưu dạng string cho tiện xử lý
  quantity: number; // Số lượng user muốn mua
  // Không lưu price ở đây — giá thay đổi bất kỳ lúc nào, lấy real-time từ Product
}

@Entity('carts') // Tên collection trong MongoDB
export class Cart {
  @ObjectIdColumn()
  _id: ObjectId;

  // userId là "foreign key" liên kết với User
  // unique: true → mỗi user chỉ có đúng 1 cart document
  @Column({ unique: true })
  userId: string;

  // items là JSON array, default là mảng rỗng khi cart mới tạo
  @Column({ type: 'json', default: [] })
  items: CartItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
