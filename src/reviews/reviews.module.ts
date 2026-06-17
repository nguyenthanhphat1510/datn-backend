import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { Review } from './entities/review.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // Đăng ký Review + Order entity → tạo repository tương ứng
    // (Order dùng read-only để kiểm tra user đã mua hàng chưa)
    TypeOrmModule.forFeature([Review, Order]),
    ProductsModule, // dùng ProductsService.findOne()/setRating()
    UsersModule, // dùng UsersService.findById() để snapshot tên người đánh giá
    // CloudinaryModule là @Global nên không cần import
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
