// src/orders/orders.controller.ts

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
   * POST /orders/:id/vnpay-url
   * Sinh URL thanh toán VNPay cho 1 đơn hàng (đơn phải là VNPAY, chưa trả).
   */
  @Post(':id/vnpay-url')
  getVnpayUrl(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.ordersService.getVnpayUrlForOrder(user.userId, id, ipAddr);
  }

  /**
   * GET /orders/vnpay-return
   * VNPay redirect khách về đây (không kèm JWT → @Public).
   * Verify chữ ký và cập nhật trạng thái thanh toán của đơn.
   */
  @Public()
  @Get('vnpay-return')
  vnpayReturn(@Query() query: Record<string, any>) {
    return this.ordersService.handleVnpayReturn(query);
  }

  /**
   * POST /orders/:id/momo-url
   * Gọi MoMo tạo giao dịch, trả URL thanh toán (đơn phải là MOMO, chưa trả).
   */
  @Post(':id/momo-url')
  getMomoUrl(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.ordersService.getMomoUrlForOrder(user.userId, id);
  }

  /**
   * GET /orders/momo-return
   * MoMo redirect khách về đây (không kèm JWT → @Public).
   * Verify chữ ký và cập nhật trạng thái thanh toán của đơn.
   */
  @Public()
  @Get('momo-return')
  momoReturn(@Query() query: Record<string, any>) {
    return this.ordersService.handleMomoReturn(query);
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
