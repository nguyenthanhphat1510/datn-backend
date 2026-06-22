import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { Disease } from '../diseases/entities/disease.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Disease, Product])],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
