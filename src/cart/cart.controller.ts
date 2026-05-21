import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('cart') // Prefix: /cart
// Không có @Public() → toàn bộ route yêu cầu JWT (JwtAuthGuard global)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * GET /cart
   * Lấy giỏ hàng của user đang đăng nhập.
   * Response: { items[], total, itemCount }
   */
  @Get()
  getCart(@CurrentUser() user: { userId: string }) {
    return this.cartService.getCart(user.userId);
  }

  /**
   * POST /cart/items
   * Thêm sản phẩm vào giỏ hoặc cộng thêm số lượng nếu đã có.
   * Body: { productId: string, quantity: number }
   */
  @Post('items')
  addItem(
    @CurrentUser() user: { userId: string },
    @Body() addItemDto: AddItemDto,
  ) {
    return this.cartService.addItem(
      user.userId,
      addItemDto.productId,
      addItemDto.quantity,
    );
  }

  /**
   * PATCH /cart/items/:productId
   * Cập nhật số lượng của 1 item. Truyền quantity=0 để xóa item.
   * Body: { quantity: number }
   */
  @Patch('items/:productId')
  updateItem(
    @CurrentUser() user: { userId: string },
    @Param('productId') productId: string,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.cartService.updateItem(
      user.userId,
      productId,
      updateItemDto.quantity,
    );
  }

  /**
   * DELETE /cart/items/:productId
   * Xóa hẳn 1 sản phẩm ra khỏi giỏ.
   */
  @HttpCode(HttpStatus.OK)
  @Delete('items/:productId')
  removeItem(
    @CurrentUser() user: { userId: string },
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(user.userId, productId);
  }

  /**
   * DELETE /cart
   * Xóa toàn bộ giỏ hàng. Gọi sau khi checkout thành công.
   */
  @HttpCode(HttpStatus.OK)
  @Delete()
  clearCart(@CurrentUser() user: { userId: string }) {
    return this.cartService.clearCart(user.userId);
  }
}
