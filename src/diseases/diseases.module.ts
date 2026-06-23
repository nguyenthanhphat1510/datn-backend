import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiseasesService } from './diseases.service';
import { DiseasesController } from './diseases.controller';
import { Disease } from './entities/disease.entity';
import { ProductsModule } from '../products/products.module';

@Module({
  // ProductsModule để dùng ProductsService.reEmbed khi liên kết bệnh-thuốc đổi.
  imports: [TypeOrmModule.forFeature([Disease]), ProductsModule],
  controllers: [DiseasesController],
  providers: [DiseasesService],
  exports: [DiseasesService],
})
export class DiseasesModule {}
