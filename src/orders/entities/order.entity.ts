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

// Phương thức thanh toán
export enum PaymentMethod {
  COD = 'cod', // Thanh toán khi nhận hàng
  VNPAY = 'vnpay', // Thanh toán qua cổng VNPay
  MOMO = 'momo', // Thanh toán qua ví MoMo
}

// Trạng thái thanh toán — tách biệt với trạng thái giao hàng
export enum PaymentStatus {
  UNPAID = 'unpaid', // Chưa thanh toán (COD luôn ở trạng thái này tới khi giao)
  PAID = 'paid', // Đã thanh toán thành công
  FAILED = 'failed', // Thanh toán thất bại / bị hủy
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
  lat?: number; // Toạ độ (resolve từ gogoduk) — dùng tính phí ship
  lon?: number;
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

  @Column({ type: 'double', default: 0 })
  shippingFee: number; // Phí vận chuyển — chốt server-side theo khoảng cách

  @Column({ type: 'double' })
  total: number; // Tổng tiền (hàng + ship) — tính sẵn để query dễ

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

  // ── Thông tin thanh toán ────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.COD,
  })
  paymentMethod: PaymentMethod; // COD mặc định

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  // Mã tham chiếu giao dịch do hệ thống sinh (gửi sang VNPay làm vnp_TxnRef)
  @Column({ nullable: true })
  paymentTxnRef?: string;

  // Mã giao dịch do VNPay trả về (vnp_TransactionNo)
  @Column({ nullable: true })
  vnpayTransactionNo?: string;

  // Mã giao dịch do MoMo trả về (transId)
  @Column({ nullable: true })
  momoTransId?: string;

  // Thời điểm thanh toán thành công
  @Column({ nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
