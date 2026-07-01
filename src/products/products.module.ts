import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { Disease } from '../diseases/entities/disease.entity';
import { Subcategory } from '../subcategories/entities/subcategory.entity';
import { Category } from '../categories/entities/category.entity';
import { Manufacturer } from '../manufacturers/entities/manufacturer.entity';

@Module({
  // Disease repo dùng để tra ngược "SP này trị bệnh gì" khi build embedding.
  // Category/Subcategory/Manufacturer repo dùng để validate ref (tồn tại + active)
  // khi tạo/sửa SP. EmbeddingService có từ EmbeddingModule (@Global) nên không cần import.
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Disease,
      Subcategory,
      Category,
      Manufacturer,
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService, TypeOrmModule], // export TypeOrmModule để CategoriesService inject Repository<Product>
})
export class ProductsModule {}
