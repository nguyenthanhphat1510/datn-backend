import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { AddressSuggestModule } from './address-suggest/address-suggest.module';
import { SubcategoriesModule } from './subcategories/subcategories.module';
import { ManufacturersModule } from './manufacturers/manufacturers.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReviewsModule } from './reviews/reviews.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { User } from './users/entities/user.entity';
import { Product } from './products/entities/product.entity';
import { Category } from './categories/entities/category.entity';
import { Cart } from './cart/entities/cart.entity';
import { Subcategory } from './subcategories/entities/subcategory.entity';
import { Manufacturer } from './manufacturers/entities/manufacturer.entity';
import { Order } from './orders/entities/order.entity';
import { Address } from './addresses/entities/address.entity';
import { Review } from './reviews/entities/review.entity';

@Module({
  imports: [
    // Load biến môi trường từ .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Kết nối MongoDB qua TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mongodb',
        url: configService.get<string>('MONGODB_URI'),
        entities: [
          User,
          Product,
          Category,
          Cart,
          Subcategory,
          Manufacturer,
          Order,
          Address,
          Review,
        ],
        synchronize: true,          // Tự tạo collection. Tắt trong production!
        useUnifiedTopology: true,
      }),
      inject: [ConfigService],
    }),
    CloudinaryModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    AddressesModule,
    AddressSuggestModule,
    SubcategoriesModule,
    ManufacturersModule,
    DashboardModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guard JWT áp dụng toàn cục - mọi route cần auth
    // Các route public dùng @Public() decorator để bỏ qua
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Guard kiểm tra role - phối hợp với @Roles() decorator
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
