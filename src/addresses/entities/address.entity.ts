import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('addresses')
export class Address {
  @ObjectIdColumn()
  _id: ObjectId;

  // userId không unique — 1 user có nhiều địa chỉ
  @Column()
  userId: string;

  @Column()
  fullName: string; // Tên người nhận

  @Column()
  phone: string; // SĐT người nhận

  @Column()
  address: string; // Địa chỉ đầy đủ (1 chuỗi gộp, lấy từ gogoduk hoặc nhập tay)

  // Toạ độ (resolve từ gogoduk) — dùng tính phí ship theo khoảng cách.
  // Nullable: địa chỉ cũ/nhập tay không qua resolve sẽ không có.
  @Column({ nullable: true })
  lat?: number;

  @Column({ nullable: true })
  lon?: number;

  // Mỗi user chỉ nên có đúng 1 địa chỉ isDefault=true (đảm bảo bởi service)
  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
