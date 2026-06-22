import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

// Model embedding hiện hành của Gemini (text-embedding-004 đã deprecated 14/1/2026).
export const EMBEDDING_MODEL = 'gemini-embedding-001';

// Số chiều vector — PHẢI khớp với numDimensions của Vector Search Index trên Atlas.
// 768: cân bằng giữa độ chính xác và dung lượng/tốc độ cho quy mô vài chục bệnh.
export const EMBEDDING_DIM = 768;

/**
 * Sinh vector embedding cho text bằng Gemini.
 *
 * Lưu ý: gemini-embedding-001 chỉ chuẩn hóa (L2-normalize) sẵn ở 3072 chiều.
 * Khi cắt xuống 768 (qua outputDimensionality), Google khuyến nghị tự normalize
 * lại để cosine similarity chính xác — nên hàm này luôn normalize đầu ra.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly ai: GoogleGenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    if (!this.ai) {
      this.logger.warn('Thiếu GEMINI_API_KEY — không sinh được embedding');
    }
  }

  /** Có cấu hình được API key hay chưa (để nơi gọi tự quyết định bỏ qua hay báo lỗi). */
  get enabled(): boolean {
    return this.ai !== null;
  }

  /**
   * Embedding cho TÀI LIỆU (lưu vào DB) — taskType RETRIEVAL_DOCUMENT.
   * Dùng khi tạo/sửa bệnh.
   */
  async embedDocument(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_DOCUMENT');
  }

  /**
   * Embedding cho CÂU TRUY VẤN (câu hỏi người dùng) — taskType RETRIEVAL_QUERY.
   * Dùng khi chatbot tìm bệnh gần nghĩa.
   */
  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_QUERY');
  }

  private async embed(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  ): Promise<number[]> {
    if (!this.ai) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình GEMINI_API_KEY để sinh embedding',
      );
    }

    const clean = text.trim();
    if (!clean) return [];

    try {
      const res = await this.ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: clean,
        config: {
          taskType,
          outputDimensionality: EMBEDDING_DIM,
        },
      });

      const values = res.embeddings?.[0]?.values;
      if (!values || values.length === 0) {
        throw new Error('Gemini trả về embedding rỗng');
      }
      return this.normalize(values);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sinh embedding thất bại: ${msg}`);
      throw new ServiceUnavailableException(
        'Không sinh được embedding (có thể hết quota API). Vui lòng thử lại sau.',
      );
    }
  }

  /** Chuẩn hóa L2: chia vector cho độ dài để |v| = 1 (cần khi cắt < 3072 chiều). */
  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    if (norm === 0) return vec;
    return vec.map((x) => x / norm);
  }
}
