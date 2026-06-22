// src/orders/orders.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import {
  Order,
  OrderStatus,
  OrderItem,
  ShippingAddress,
  PaymentMethod,
  PaymentStatus,
} from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { AddressesService } from '../addresses/addresses.service';
import { calcShippingFee } from '../common/shipping';
import { VnpayService } from '../payments/vnpay.service';
import { MomoService } from '../payments/momo.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: MongoRepository<Order>,
    private cartService: CartService,
    private productsService: ProductsService,
    private addressesService: AddressesService,
    private vnpayService: VnpayService,
    private momoService: MomoService,
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
        lat: addr.lat,
        lon: addr.lon,
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

      // Giá bán thực tế = giá khuyến mãi nếu có, ngược lại là giá gốc
      const unitPrice = product.salePrice ?? product.price;

      // Snapshot thông tin sản phẩm tại thời điểm mua — đóng băng dữ liệu
      orderItems.push({
        productId: cartItem.productId,
        name: product.name, // Snapshot tên
        imageUrl: product.images?.[0]?.url ?? '', // Snapshot ảnh
        price: unitPrice, // ⭐ Snapshot giá đã áp khuyến mãi
        quantity: cartItem.quantity,
        subtotal: unitPrice * cartItem.quantity, // Tính sẵn
      });
    }

    // ── BƯỚC 4: Trừ stock ─────────────────────────────────────────────────
    // Làm sau khi đã validate HẾT → tránh trừ 1 nửa rồi mới phát hiện lỗi
    for (const item of orderItems) {
      // updateStock nhận delta âm để trừ kho
      await this.productsService.updateStock(item.productId, -item.quantity);
    }

    // ── BƯỚC 5: Tính tổng (hàng + ship) và tạo Order ──────────────────────
    const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    // Chốt phí ship server-side theo toạ độ — không tin số từ client.
    const { fee: shippingFee } = calcShippingFee(
      subtotal,
      shippingAddress.lat,
      shippingAddress.lon,
    );
    const total = subtotal + shippingFee;

    // Phương thức thanh toán — mặc định COD nếu client không gửi
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.COD;

    const order = this.ordersRepository.create({
      userId,
      items: orderItems,
      shippingFee,
      total,
      status: OrderStatus.PENDING,
      shippingAddress, // đã resolve ở BƯỚC 0 (từ sổ hoặc nhập tay)
      note: dto.note,
      paymentMethod,
      paymentStatus: PaymentStatus.UNPAID,
    });

    const savedOrder = await this.ordersRepository.save(order);

    // Với cổng thanh toán online (VNPay/MoMo): gán mã tham chiếu giao dịch
    // (duy nhất) để map khi nhận return. Dùng timestamp (ms) — toàn số, duy
    // nhất theo thời gian; hợp lệ cho cả vnp_TxnRef lẫn MoMo orderId/requestId.
    if (
      paymentMethod === PaymentMethod.VNPAY ||
      paymentMethod === PaymentMethod.MOMO
    ) {
      savedOrder.paymentTxnRef = String(Date.now());
      await this.ordersRepository.save(savedOrder);
    }

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

  /** [Admin] Tất cả đơn hàng (phân trang), mới nhất lên đầu. */
  async findAllAdmin(
    status?: OrderStatus,
    pagination: { page?: number; limit?: number } = {},
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const where = status ? { status } : {};
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    const [data, total] = await this.ordersRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' } as any,
    });

    return { data, total, page, limit };
  }

  /** [Admin] Cập nhật trạng thái 1 đơn hàng. */
  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    if (!ObjectId.isValid(orderId)) {
      throw new BadRequestException('ID đơn hàng không hợp lệ');
    }
    const order = await this.ordersRepository.findOne({
      where: { _id: new ObjectId(orderId) },
    });
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID: ${orderId}`);
    }
    order.status = status;
    return this.ordersRepository.save(order);
  }

  /**
   * Sinh URL thanh toán VNPay cho 1 đơn hàng.
   * Kiểm tra: đơn tồn tại, thuộc về user, là VNPAY và chưa thanh toán.
   */
  async getVnpayUrlForOrder(
    userId: string,
    orderId: string,
    ipAddr: string,
  ): Promise<{ paymentUrl: string }> {
    if (!ObjectId.isValid(orderId)) {
      throw new BadRequestException('ID đơn hàng không hợp lệ');
    }
    const order = await this.ordersRepository.findOne({
      where: { _id: new ObjectId(orderId) },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (order.userId !== userId) {
      throw new BadRequestException('Đơn hàng không thuộc về bạn');
    }
    if (order.paymentMethod !== PaymentMethod.VNPAY) {
      throw new BadRequestException('Đơn hàng này không thanh toán qua VNPay');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn hàng đã được thanh toán');
    }

    const paymentUrl = this.vnpayService.buildPaymentUrl({
      txnRef: order.paymentTxnRef ?? order._id.toString(),
      amount: order.total,
      orderInfo: `Thanh toan don hang ${order._id.toString()}`,
      ipAddr,
    });

    return { paymentUrl };
  }

  /**
   * Xử lý kết quả VNPay redirect về (Return URL).
   * Verify chữ ký, rồi cập nhật trạng thái thanh toán của đơn.
   * Idempotent: đơn đã PAID thì trả thành công luôn, không xử lý lại.
   */
  async handleVnpayReturn(
    query: Record<string, any>,
  ): Promise<{ success: boolean; orderId: string | null; message: string }> {
    const result = this.vnpayService.verifyReturn(query);

    if (!result.valid) {
      return {
        success: false,
        orderId: null,
        message: 'Chữ ký không hợp lệ',
      };
    }

    // Tìm đơn theo paymentTxnRef đã lưu khi tạo đơn
    const order = await this.ordersRepository.findOne({
      where: { paymentTxnRef: result.txnRef },
    });
    if (!order) {
      return {
        success: false,
        orderId: null,
        message: 'Không tìm thấy đơn hàng tương ứng',
      };
    }

    const orderId = order._id.toString();

    // Đã thanh toán rồi → idempotent, không ghi đè
    if (order.paymentStatus === PaymentStatus.PAID) {
      return { success: true, orderId, message: 'Đơn hàng đã được thanh toán' };
    }

    if (result.responseCode === '00') {
      order.paymentStatus = PaymentStatus.PAID;
      order.vnpayTransactionNo = result.transactionNo;
      order.paidAt = new Date();
      await this.ordersRepository.save(order);
      return { success: true, orderId, message: 'Thanh toán thành công' };
    }

    // Thất bại / bị hủy
    order.paymentStatus = PaymentStatus.FAILED;
    await this.ordersRepository.save(order);
    return {
      success: false,
      orderId,
      message: 'Thanh toán không thành công hoặc đã bị hủy',
    };
  }

  /**
   * Sinh URL thanh toán MoMo cho 1 đơn hàng.
   * Kiểm tra giống VNPay: đơn tồn tại, thuộc về user, là MOMO, chưa thanh toán.
   * Khác VNPay: phải gọi MoMo API (server→server) để lấy payUrl.
   */
  async getMomoUrlForOrder(
    userId: string,
    orderId: string,
  ): Promise<{ paymentUrl: string }> {
    if (!ObjectId.isValid(orderId)) {
      throw new BadRequestException('ID đơn hàng không hợp lệ');
    }
    const order = await this.ordersRepository.findOne({
      where: { _id: new ObjectId(orderId) },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (order.userId !== userId) {
      throw new BadRequestException('Đơn hàng không thuộc về bạn');
    }
    if (order.paymentMethod !== PaymentMethod.MOMO) {
      throw new BadRequestException('Đơn hàng này không thanh toán qua MoMo');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn hàng đã được thanh toán');
    }

    const paymentUrl = await this.momoService.createPayment({
      orderId: order.paymentTxnRef ?? order._id.toString(),
      amount: order.total,
      orderInfo: `Thanh toan don hang ${order._id.toString()}`,
    });

    return { paymentUrl };
  }

  /**
   * Xử lý kết quả MoMo redirect về (Return URL).
   * Đối xứng handleVnpayReturn. Idempotent: đơn đã PAID không xử lý lại.
   */
  async handleMomoReturn(
    query: Record<string, any>,
  ): Promise<{ success: boolean; orderId: string | null; message: string }> {
    const result = this.momoService.verifyReturn(query);

    if (!result.valid) {
      return { success: false, orderId: null, message: 'Chữ ký không hợp lệ' };
    }

    // MoMo orderId chính là paymentTxnRef đã lưu khi tạo đơn
    const order = await this.ordersRepository.findOne({
      where: { paymentTxnRef: result.orderId },
    });
    if (!order) {
      return {
        success: false,
        orderId: null,
        message: 'Không tìm thấy đơn hàng tương ứng',
      };
    }

    const orderId = order._id.toString();

    if (order.paymentStatus === PaymentStatus.PAID) {
      return { success: true, orderId, message: 'Đơn hàng đã được thanh toán' };
    }

    // MoMo: resultCode '0' = thành công (query trả về dạng chuỗi)
    if (result.resultCode === '0') {
      order.paymentStatus = PaymentStatus.PAID;
      order.momoTransId = result.transId;
      order.paidAt = new Date();
      await this.ordersRepository.save(order);
      return { success: true, orderId, message: 'Thanh toán thành công' };
    }

    order.paymentStatus = PaymentStatus.FAILED;
    await this.ordersRepository.save(order);
    return {
      success: false,
      orderId,
      message: 'Thanh toán không thành công hoặc đã bị hủy',
    };
  }
}
