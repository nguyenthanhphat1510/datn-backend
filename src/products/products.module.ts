import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { Disease } from '../diseases/entities/disease.entity';

@Module({
  // Disease repo dùng để tra ngược "SP này trị bệnh gì" khi build embedding.
  // EmbeddingService có từ EmbeddingModule (@Global) nên không cần import.
  imports: [TypeOrmModule.forFeature([Product, Disease])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService, TypeOrmModule], // export TypeOrmModule để CategoriesService inject Repository<Product>
})
export class ProductsModule {}
