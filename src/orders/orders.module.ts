// src/orders/orders.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { AddressesModule } from '../addresses/addresses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]), // Đăng ký Order entity → tạo OrderRepository
    CartModule, // Để dùng CartService.getCart() và CartService.clearCart()
    ProductsModule, // Để dùng ProductsService.findOne() và updateStock()
    AddressesModule, // Để dùng AddressesService.findOneOwned() khi checkout từ sổ
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService], // Export để module khác dùng nếu cần
})
export class OrdersModule {}
