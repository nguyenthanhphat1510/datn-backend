// src/orders/entities/order.entity.ts

import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

// Trạng thái vòng đời của đơn hàng
export enum OrderStatus {
  PENDING = 'pending', // Vừa đặt, chưa xác nhận
  CONFIRMED = 'confirmed', // Admin đã xác nhận
  SHIPPING = 'shipping', // Đang giao hàng
  DELIVERED = 'delivered', // Giao thành công
  CANCELLED = 'cancelled', // Đã hủy
}

// Mỗi sản phẩm trong đơn hàng — embedded document
export interface OrderItem {
  productId: string; // Tham chiếu đến Product
  name: string; // Lưu tên sản phẩm tại thời điểm mua (phòng SP bị đổi tên)
  imageUrl: string; // Ảnh tại thời điểm mua
  price: number; // ⭐ Giá TẠI THỜI ĐIỂM MUA — không bao giờ thay đổi
  quantity: number; // Số lượng đã mua
  subtotal: number; // price * quantity — tính sẵn
}

// Địa chỉ giao hàng — embedded document
export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string; // Địa chỉ đầy đủ (1 chuỗi gộp, lấy từ gogoduk hoặc nhập tay)
}

@Entity('orders')
export class Order {
  @ObjectIdColumn()
  _id: ObjectId;

  // userId không unique — 1 user có nhiều orders
  @Column()
  userId: string;

  @Column({ type: 'json' })
  items: OrderItem[]; // Snapshot của giỏ hàng tại thời điểm checkout

  @Column({ type: 'double' })
  total: number; // Tổng tiền — tính sẵn để query dễ

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'json' })
  shippingAddress: ShippingAddress; // Địa chỉ giao hàng

  @Column({ nullable: true })
  note: string; // Ghi chú của khách (tùy chọn)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
