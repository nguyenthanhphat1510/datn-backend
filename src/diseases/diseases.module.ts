import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { DiseasesService } from './diseases.service';
import { DiseasePredictionService } from './disease-prediction.service';
import { DiseasesController } from './diseases.controller';
import { Disease } from './entities/disease.entity';
import { ProductsModule } from '../products/products.module';

@Module({
  // ProductsModule để dùng ProductsService.reEmbed khi liên kết bệnh-thuốc đổi.
  // HttpModule để gọi ml-service (FastAPI) dự đoán bệnh từ ảnh.
  imports: [TypeOrmModule.forFeature([Disease]), ProductsModule, HttpModule],
  controllers: [DiseasesController],
  providers: [DiseasesService, DiseasePredictionService],
  // DiseasePredictionService export để ChatbotModule tái dùng (nhánh gửi ảnh trong chatbot).
  exports: [DiseasesService, DiseasePredictionService],
})
export class DiseasesModule {}
