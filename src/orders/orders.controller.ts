// src/orders/orders.controller.ts

import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from './entities/order.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

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

  /**
   * [Admin] GET /orders/admin
   * Danh sách tất cả đơn hàng, lọc theo status (tùy chọn).
   * TODO: bật lại @Roles(UserRole.ADMIN) khi bật phân quyền.
   */
  @Public()
  @Get('admin')
  findAllAdmin(
    @Query('status') status?: OrderStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findAllAdmin(status, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * [Admin] PATCH /orders/admin/:id/status
   * Cập nhật trạng thái đơn hàng.
   * TODO: bật lại @Roles(UserRole.ADMIN) khi bật phân quyền.
   */
  @Public()
  @Patch('admin/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status);
  }
}
