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
  province: string; // Tỉnh/Thành phố

  @Column()
  ward: string; // Phường/Xã

  @Column()
  street: string; // Số nhà, tên đường

  // Mỗi user chỉ nên có đúng 1 địa chỉ isDefault=true (đảm bảo bởi service)
  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
