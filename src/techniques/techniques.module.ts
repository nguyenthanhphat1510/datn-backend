import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechniquesController } from './techniques.controller';
import { TechniquesService } from './techniques.service';
import { TechniqueChunk } from './entities/technique-chunk.entity';

// EmbeddingModule là global (xem common/embedding) nên chỉ cần inject
// EmbeddingService, không cần import lại ở đây.
@Module({
  imports: [TypeOrmModule.forFeature([TechniqueChunk])],
  controllers: [TechniquesController],
  providers: [TechniquesService],
  // Export để ChatbotModule dùng searchRelevant ở nhánh ky_thuat.
  exports: [TechniquesService],
})
export class TechniquesModule {}
