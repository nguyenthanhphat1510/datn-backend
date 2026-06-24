import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { Disease } from '../diseases/entities/disease.entity';
import { Product } from '../products/entities/product.entity';
import { TechniquesModule } from '../techniques/techniques.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Disease, Product]),
    // Cung cấp TechniquesService cho nhánh ky_thuat (RAG trên tài liệu kỹ thuật).
    TechniquesModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
