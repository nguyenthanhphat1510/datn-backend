// src/orders/orders.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import {
  Order,
  OrderStatus,
  OrderItem,
  ShippingAddress,
} from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { AddressesService } from '../addresses/addresses.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: MongoRepository<Order>,
    private cartService: CartService,
    private productsService: ProductsService,
    private addressesService: AddressesService,
  ) {}

  /**
   * Resolve địa chỉ giao hàng cho đơn:
   * - Ưu tiên addressId (lấy từ sổ địa chỉ, có check quyền sở hữu)
   * - Nếu không có thì dùng shippingAddress nhập tay
   * - Không có cả hai → lỗi
   */
  private async resolveShippingAddress(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<ShippingAddress> {
    if (dto.addressId) {
      const addr = await this.addressesService.findOneOwned(
        userId,
        dto.addressId,
      );
      return {
        fullName: addr.fullName,
        phone: addr.phone,
        address: addr.address,
      };
    }

    if (dto.shippingAddress) {
      return dto.shippingAddress;
    }

    throw new BadRequestException('Thiếu địa chỉ giao hàng');
  }

  /**
   * POST /orders — Checkout: chuyển Cart → Order
   *
   * Luồng:
   * 1. Lấy cart hiện tại của user
   * 2. Validate cart không rỗng
   * 3. Với từng item: verify product, check stock, snapshot giá
   * 4. Trừ stock của từng product (chỉ sau khi validate HẾT)
   * 5. Tạo Order document
   * 6. Clear cart
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
    // ── BƯỚC 0: Resolve địa chỉ giao hàng (fail sớm nếu thiếu/không hợp lệ) ─
    const shippingAddress = await this.resolveShippingAddress(userId, dto);

    // ── BƯỚC 1: Lấy cart của user ──────────────────────────────────────────
    const cart = await this.cartService.getCart(userId);

    // ── BƯỚC 2: Kiểm tra giỏ không rỗng ───────────────────────────────────
    if (cart.items.length === 0) {
      throw new BadRequestException('Giỏ hàng đang trống, không thể đặt hàng');
    }

    // ── BƯỚC 3: Validate stock và build OrderItems ─────────────────────────
    const orderItems: OrderItem[] = [];

    for (const cartItem of cart.items) {
      // Lấy thông tin product mới nhất (để check stock và lấy giá chính xác)
      const product = await this.productsService.findOne(cartItem.productId);

      if (!product.isActive) {
        throw new BadRequestException(
          `Sản phẩm "${product.name}" hiện không còn bán`,
        );
      }

      if (cartItem.quantity > product.stock) {
        throw new BadRequestException(
          `Sản phẩm "${product.name}" chỉ còn ${product.stock} trong kho`,
        );
      }

      // Snapshot thông tin sản phẩm tại thời điểm mua — đóng băng dữ liệu
      orderItems.push({
        productId: cartItem.productId,
        name: product.name, // Snapshot tên
        imageUrl: product.images?.[0]?.url ?? '', // Snapshot ảnh
        price: product.price, // ⭐ Snapshot giá
        quantity: cartItem.quantity,
        subtotal: product.price * cartItem.quantity, // Tính sẵn
      });
    }

    // ── BƯỚC 4: Trừ stock ─────────────────────────────────────────────────
    // Làm sau khi đã validate HẾT → tránh trừ 1 nửa rồi mới phát hiện lỗi
    for (const item of orderItems) {
      // updateStock nhận delta âm để trừ kho
      await this.productsService.updateStock(item.productId, -item.quantity);
    }

    // ── BƯỚC 5: Tính tổng và tạo Order ────────────────────────────────────
    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    const order = this.ordersRepository.create({
      userId,
      items: orderItems,
      total,
      status: OrderStatus.PENDING,
      shippingAddress, // đã resolve ở BƯỚC 0 (từ sổ hoặc nhập tay)
      note: dto.note,
    });

    const savedOrder = await this.ordersRepository.save(order);

    // ── BƯỚC 6: Xóa giỏ hàng sau khi đặt thành công ──────────────────────
    await this.cartService.clearCart(userId);

    return savedOrder;
  }

  /** GET /orders — danh sách đơn của user, mới nhất lên đầu. */
  async findAllByUser(userId: string): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' } as any,
    });
  }
}
