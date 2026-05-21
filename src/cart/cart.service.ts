import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Cart, CartItem } from './entities/cart.entity';
import { ProductsService } from '../products/products.service';

// ─── Response interfaces ──────────────────────────────────────────────────────
export interface CartItemResponse {
  productId: string;
  name: string;
  imageUrl: string;
  price: number;      // Giá real-time từ Product (không phải giá lưu trong cart)
  quantity: number;
  subtotal: number;   // price * quantity — tính sẵn ở backend cho FE dùng
}

export interface CartResponse {
  items: CartItemResponse[];
  total: number;      // Tổng tiền toàn giỏ
  itemCount: number;  // Số loại sản phẩm (không phải tổng quantity)
}
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private cartRepository: MongoRepository<Cart>,
    private productsService: ProductsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Tìm cart của user, nếu chưa có thì TẠO MỚI.
   * DRY: getCart, addItem, removeItem đều dùng chung helper này.
   */
  private async findOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({ where: { userId } });

    if (!cart) {
      cart = this.cartRepository.create({
        userId,
        items: [],
      });
      await this.cartRepository.save(cart);
    }

    return cart;
  }

  /**
   * Gộp CartItem[] với Product data → trả về CartResponse đầy đủ cho FE.
   * Tách helper vì getCart/addItem/updateItem/removeItem đều trả về cùng format.
   */
  private async buildCartResponse(cart: Cart): Promise<CartResponse> {
    if (cart.items.length === 0) {
      return { items: [], total: 0, itemCount: 0 };
    }

    // Promise.all → query song song, không query tuần tự
    const itemResponses = await Promise.all(
      cart.items.map(async (item) => {
        const product = await this.productsService.findOne(item.productId);

        return {
          productId: item.productId,
          name: product.name,
          imageUrl: product.images?.[0]?.url ?? '',
          price: product.price,
          quantity: item.quantity,
          subtotal: product.price * item.quantity,
        } as CartItemResponse;
      }),
    );

    const total = itemResponses.reduce((sum, item) => sum + item.subtotal, 0);

    return {
      items: itemResponses,
      total,
      itemCount: itemResponses.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS — được gọi từ CartController
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /cart
   * Lấy giỏ hàng hiện tại của user kèm thông tin sản phẩm và tổng tiền.
   */
  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);
    return this.buildCartResponse(cart);
  }

  /**
   * POST /cart/items
   * Thêm sản phẩm vào giỏ. Nếu đã có → cộng thêm quantity.
   */
  async addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartResponse> {
    // 1. Kiểm tra product tồn tại và còn hoạt động
    const product = await this.productsService.findOne(productId);

    if (!product.isActive) {
      throw new BadRequestException('Sản phẩm này hiện không còn bán');
    }

    // 2. Lấy hoặc tạo cart
    const cart = await this.findOrCreateCart(userId);

    // 3. Kiểm tra sản phẩm đã có trong giỏ chưa
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId === productId,
    );

    if (existingItemIndex >= 0) {
      // Đã có → cộng thêm quantity
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;

      if (newQuantity > product.stock) {
        throw new BadRequestException(
          `Chỉ còn ${product.stock} sản phẩm trong kho`,
        );
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Chưa có → thêm item mới
      if (quantity > product.stock) {
        throw new BadRequestException(
          `Chỉ còn ${product.stock} sản phẩm trong kho`,
        );
      }

      cart.items.push({ productId, quantity });
    }

    // 4. Lưu vào DB
    await this.cartRepository.save(cart);

    // 5. Trả về cart response đầy đủ
    return this.buildCartResponse(cart);
  }

  /**
   * PATCH /cart/items/:productId
   * Cập nhật số lượng của 1 item. Nếu quantity = 0 → tự động xóa item đó.
   */
  async updateItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    const itemIndex = cart.items.findIndex(
      (item) => item.productId === productId,
    );

    if (itemIndex < 0) {
      throw new NotFoundException('Sản phẩm này không có trong giỏ hàng');
    }

    if (quantity === 0) {
      // quantity = 0 → xóa item
      cart.items.splice(itemIndex, 1);
    } else {
      // Kiểm tra stock trước khi cập nhật
      const product = await this.productsService.findOne(productId);
      if (quantity > product.stock) {
        throw new BadRequestException(
          `Chỉ còn ${product.stock} sản phẩm trong kho`,
        );
      }
      cart.items[itemIndex].quantity = quantity;
    }

    await this.cartRepository.save(cart);
    return this.buildCartResponse(cart);
  }

  /**
   * DELETE /cart/items/:productId
   * Xóa hẳn 1 item ra khỏi giỏ.
   */
  async removeItem(userId: string, productId: string): Promise<CartResponse> {
    const cart = await this.findOrCreateCart(userId);

    const itemExists = cart.items.some((item) => item.productId === productId);
    if (!itemExists) {
      throw new NotFoundException('Sản phẩm này không có trong giỏ hàng');
    }

    // filter() tạo mảng mới, không mutate mảng gốc
    cart.items = cart.items.filter((item) => item.productId !== productId);

    await this.cartRepository.save(cart);
    return this.buildCartResponse(cart);
  }

  /**
   * DELETE /cart
   * Xóa toàn bộ giỏ hàng (reset về rỗng).
   * Dùng sau khi checkout thành công.
   */
  async clearCart(userId: string): Promise<{ message: string }> {
    const cart = await this.findOrCreateCart(userId);

    // Không xóa Cart document khỏi DB — chỉ reset items về []
    // Lần sau user vào giỏ không cần tạo lại document
    cart.items = [];
    await this.cartRepository.save(cart);

    return { message: 'Đã xóa toàn bộ giỏ hàng' };
  }
}
