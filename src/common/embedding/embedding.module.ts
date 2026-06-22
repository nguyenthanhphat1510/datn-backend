import { Global, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

// Global: cả DiseasesService (sinh embedding khi CRUD) lẫn ChatbotService
// (embedding câu hỏi) đều dùng chung, khỏi import lặp ở mỗi module.
@Global()
@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
