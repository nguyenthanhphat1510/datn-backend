import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  // KHÔNG unique index: user đăng ký bằng email có googleId=null, nhiều null
  // sẽ trùng key. Việc chống trùng googleId do findOrCreateGoogleUser lo ở code.
  @Column({ nullable: true })
  googleId: string; // ID từ Google, dùng để nhận diện tài khoản Google

  @Column({ nullable: true })
  avatar: string; // URL ảnh đại diện từ Google

  @Column({ nullable: true })
  fullName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
