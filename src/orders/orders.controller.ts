// src/orders/orders.controller.ts

import { Controller, Post, Get, Body } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('orders') // Prefix: /orders
// Không có @Public() → toàn bộ route yêu cầu JWT (JwtAuthGuard global)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /orders
   * Checkout: tạo đơn hàng từ giỏ hàng hiện tại.
   * Body: { shippingAddress: {...}, note?: string }
   */
  @Post()
  createOrder(
    @CurrentUser() user: { userId: string },
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.userId, createOrderDto);
  }

  /**
   * GET /orders
   * Danh sách đơn hàng của user hiện tại (mới nhất lên đầu).
   */
  @Get()
  findMyOrders(@CurrentUser() user: { userId: string }) {
    return this.ordersService.findAllByUser(user.userId);
  }
}
