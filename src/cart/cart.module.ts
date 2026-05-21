import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { Cart } from './entities/cart.entity';
import { ProductsModule } from '../products/products.module';
// ProductsModule export ProductsService → CartService mới inject được

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart]), // Đăng ký Cart entity → tạo CartRepository
    ProductsModule,                   // Import để dùng ProductsService bên trong
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService], // Export để OrderModule dùng sau này khi checkout
})
export class CartModule {}
