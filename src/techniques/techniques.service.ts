import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { TechniqueChunk } from './entities/technique-chunk.entity';
import { EmbeddingService } from '../common/embedding/embedding.service';

// Tên Vector Search Index tạo trên Atlas cho collection technique_chunks.
// PHẢI khớp tên index bạn tạo trên Atlas (field "embedding", 768 chiều, cosine).
export const TECHNIQUE_VECTOR_INDEX = 'technique_vector_index';

// Độ dài mục tiêu của mỗi chunk (số ký tự). ~800 ~ một đoạn văn: đủ ngữ cảnh
// nhưng vẫn gói gọn một ý để vector tìm chính xác.
const CHUNK_SIZE = 800;

// Phần chồng lấp giữa hai chunk liền kề (số ký tự). Lặp lại đuôi chunk trước ở
// đầu chunk sau để không mất ý nằm ngay chỗ cắt.
const CHUNK_OVERLAP = 100;

@Injectable()
export class TechniquesService {
  private readonly logger = new Logger(TechniquesService.name);

  constructor(
    @InjectRepository(TechniqueChunk)
    private readonly chunksRepository: MongoRepository<TechniqueChunk>,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /* ─────────────────────────────────────────
     Nạp tài liệu: extract → chunk → embedding → lưu
  ───────────────────────────────────────── */

  /**
   * Nạp một file tài liệu (PDF/txt/md): tách text, cắt chunk, sinh embedding từng
   * chunk rồi lưu. Trả về tóm tắt số chunk đã nạp.
   */
  async ingest(
    file: Express.Multer.File,
  ): Promise<{ docId: string; docTitle: string; chunks: number }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File rỗng hoặc không hợp lệ');
    }

    const text = await this.extractText(file);
    if (!text.trim()) {
      throw new BadRequestException(
        'Không trích được nội dung văn bản từ file',
      );
    }

    const pieces = this.chunk(text);
    if (pieces.length === 0) {
      throw new BadRequestException('Nội dung quá ngắn để tạo tài liệu');
    }

    // docId gom các chunk cùng tài liệu; thêm timestamp để upload trùng tên vẫn tách.
    const docTitle = file.originalname || 'tai-lieu';
    const docId = `${Date.now()}-${docTitle}`;

    const docs: TechniqueChunk[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const content = pieces[i];
      const embedding = await this.safeEmbed(content);
      docs.push(
        this.chunksRepository.create({
          docId,
          docTitle,
          content,
          chunkIndex: i,
          embedding,
          isActive: true,
        }),
      );
    }

    await this.chunksRepository.save(docs);
    this.logger.log(`Đã nạp tài liệu "${docTitle}" thành ${docs.length} chunk`);
    return { docId, docTitle, chunks: docs.length };
  }

  /** Tách text thuần từ file. PDF qua pdf-parse; txt/md đọc buffer trực tiếp. */
  private async extractText(file: Express.Multer.File): Promise<string> {
    const name = (file.originalname || '').toLowerCase();
    const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf');

    let raw: string;
    if (isPdf) {
      try {
        // pdf-parse là CommonJS (export =) → dynamic import rồi lấy default.
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(file.buffer);
        raw = parsed.text ?? '';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Đọc PDF thất bại: ${msg}`);
        // pdf-parse không đọc được file (PDF hỏng, mã hóa, hoặc cấu trúc lạ).
        throw new BadRequestException(
          'Không đọc được file PDF này (file có thể bị hỏng, được mã hóa, hoặc là bản scan). ' +
            'Bạn thử lưu lại PDF bằng "In ra PDF" rồi tải lên, hoặc dùng file .txt (copy nội dung ra text).',
        );
      }

      // PDF đọc được nhưng KHÔNG có text (PDF scan = ảnh, không có lớp văn bản).
      if (!raw.trim()) {
        throw new BadRequestException(
          'File PDF này không chứa văn bản trích xuất được (nhiều khả năng là bản scan/ảnh). ' +
            'Bạn dùng công cụ OCR hoặc copy nội dung sang file .txt rồi tải lên nhé.',
        );
      }
    } else {
      // txt / md / text thuần
      raw = file.buffer.toString('utf-8');
    }

    // Chuẩn hóa khoảng trắng: gộp nhiều dòng trống thành 1, bỏ space thừa cuối dòng.
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Cắt text thành các chunk ~CHUNK_SIZE ký tự, ưu tiên cắt theo ranh giới đoạn
   * văn (dòng trống) để mỗi chunk là một ý trọn vẹn; có overlap CHUNK_OVERLAP ký
   * tự giữa các chunk để không mất ngữ cảnh ở chỗ cắt. Hàm thuần, dễ test/chỉnh.
   */
  chunk(text: string): string[] {
    // Tách theo đoạn văn trước (dòng trống), rồi gộp dần tới gần CHUNK_SIZE.
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let buf = '';

    const flush = () => {
      const trimmed = buf.trim();
      if (trimmed) chunks.push(trimmed);
      // Bắt đầu buffer mới bằng phần đuôi (overlap) của chunk vừa chốt.
      buf = trimmed ? trimmed.slice(-CHUNK_OVERLAP) : '';
    };

    for (const para of paragraphs) {
      // Đoạn đơn lẻ dài hơn CHUNK_SIZE → cắt cứng theo độ dài để không vượt quá xa.
      if (para.length > CHUNK_SIZE) {
        if (buf.trim()) flush();
        for (let i = 0; i < para.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
          chunks.push(para.slice(i, i + CHUNK_SIZE).trim());
        }
        buf = chunks.length
          ? chunks[chunks.length - 1].slice(-CHUNK_OVERLAP)
          : '';
        continue;
      }

      // Gộp đoạn vào buffer; nếu vượt CHUNK_SIZE thì chốt chunk trước rồi gộp tiếp.
      if (buf && buf.length + 1 + para.length > CHUNK_SIZE) {
        flush();
      }
      buf = buf ? `${buf} ${para}` : para;
    }
    if (buf.trim()) chunks.push(buf.trim());

    // Loại chunk trùng hệt nhau (sinh ra do overlap khi đoạn ngắn).
    return chunks.filter((c, i) => c && chunks.indexOf(c) === i);
  }

  /**
   * Sinh embedding cho một chunk. Bọc try/catch để lỗi (vd hết quota) KHÔNG chặn
   * việc nạp tài liệu — chỉ log, lưu vector rỗng và có thể re-embed sau.
   * (Cùng pattern safeEmbed của DiseasesService.)
   */
  private async safeEmbed(text: string): Promise<number[]> {
    if (!text || !this.embeddingService.enabled) return [];
    try {
      return await this.embeddingService.embedDocument(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Sinh embedding chunk thất bại, lưu vector rỗng: ${msg}`,
      );
      return [];
    }
  }

  /* ─────────────────────────────────────────
     Truy vấn: tìm chunk liên quan cho chatbot
  ───────────────────────────────────────── */

  /**
   * Atlas Vector Search: tìm các chunk gần nghĩa nhất với vector câu hỏi (đang
   * active). Trả về content + docTitle + score. Khuôn giống findBestDisease.
   */
  async searchRelevant(
    queryVector: number[],
    limit: number,
    minScore: number,
  ): Promise<{ content: string; docTitle: string; score: number }[]> {
    if (!queryVector.length) return [];

    try {
      const results = (await this.chunksRepository
        .aggregate([
          {
            $vectorSearch: {
              index: TECHNIQUE_VECTOR_INDEX,
              path: 'embedding',
              queryVector,
              numCandidates: 100,
              limit,
            },
          },
          {
            $project: {
              content: 1,
              docTitle: 1,
              isActive: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray()) as Array<{
        content: string;
        docTitle: string;
        isActive?: boolean;
        score: number;
      }>;

      return results
        .filter((r) => r.isActive !== false && r.score >= minScore)
        .map((r) => ({
          content: r.content,
          docTitle: r.docTitle,
          score: r.score,
        }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Vector search tài liệu thất bại (đã tạo index "${TECHNIQUE_VECTOR_INDEX}" trên Atlas chưa?): ${msg}`,
      );
      return [];
    }
  }

  /* ─────────────────────────────────────────
     Quản lý tài liệu (cho admin)
  ───────────────────────────────────────── */

  /** Liệt kê các tài liệu đã nạp (gom theo docId), kèm số chunk của mỗi tài liệu. */
  async listDocs(): Promise<
    { docId: string; docTitle: string; chunks: number; createdAt: Date }[]
  > {
    const rows = (await this.chunksRepository
      .aggregate([
        {
          $group: {
            _id: '$docId',
            docTitle: { $first: '$docTitle' },
            chunks: { $sum: 1 },
            createdAt: { $min: '$createdAt' },
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      .toArray()) as Array<{
      _id: string;
      docTitle: string;
      chunks: number;
      createdAt: Date;
    }>;

    return rows.map((r) => ({
      docId: r._id,
      docTitle: r.docTitle,
      chunks: r.chunks,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Lấy toàn bộ nội dung một tài liệu để HIỂN THỊ cho người đọc (storefront).
   * Ghép các chunk theo chunkIndex và loại bỏ phần overlap lặp ở đầu mỗi chunk
   * (CHUNK_OVERLAP ký tự đuôi chunk trước được lặp lại ở đầu chunk sau) để văn
   * bản đọc liền mạch, không bị lặp. Không trả embedding (nặng, vô nghĩa với UI).
   */
  async getDocContent(docId: string): Promise<{
    docId: string;
    docTitle: string;
    content: string;
    chunks: number;
    createdAt: Date | null;
  }> {
    const rows = await this.chunksRepository.find({
      where: { docId, isActive: true },
      order: { chunkIndex: 'ASC' } as any,
    });
    if (rows.length === 0) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }

    // Ghép chunk: từ chunk thứ 2 trở đi, bỏ phần đầu trùng với đuôi chunk trước
    // (do overlap). Khớp linh hoạt: tìm độ chồng lấp thực tế tối đa CHUNK_OVERLAP.
    let content = rows[0].content;
    for (let i = 1; i < rows.length; i++) {
      const next = rows[i].content;
      const maxOverlap = Math.min(CHUNK_OVERLAP, content.length, next.length);
      let cut = 0;
      for (let len = maxOverlap; len > 0; len--) {
        if (content.slice(-len) === next.slice(0, len)) {
          cut = len;
          break;
        }
      }
      content += (cut > 0 ? '' : ' ') + next.slice(cut);
    }

    return {
      docId,
      docTitle: rows[0].docTitle,
      content: content.trim(),
      chunks: rows.length,
      createdAt: rows[0].createdAt ?? null,
    };
  }

  /** Xóa toàn bộ chunk của một tài liệu theo docId. */
  async removeDoc(
    docId: string,
  ): Promise<{ message: string; deleted: number }> {
    const res = await this.chunksRepository.deleteMany({ docId });
    const deleted = res.deletedCount ?? 0;
    if (deleted === 0) {
      throw new NotFoundException('Không tìm thấy tài liệu để xóa');
    }
    return { message: 'Đã xóa tài liệu thành công', deleted };
  }
}
