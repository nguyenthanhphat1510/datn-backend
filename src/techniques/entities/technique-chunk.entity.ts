import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

/**
 * Một ĐOẠN (chunk) cắt ra từ tài liệu kỹ thuật canh tác do admin upload.
 * Tài liệu dài được tách thành nhiều chunk, mỗi chunk có embedding riêng để
 * Atlas Vector Search tìm đúng đoạn liên quan với câu hỏi (nhánh ky_thuat).
 *
 * Metadata tài liệu (docId, docTitle) được gom vào mỗi chunk cho gọn — xóa cả
 * tài liệu = xóa mọi chunk cùng docId.
 */
@Entity('technique_chunks')
export class TechniqueChunk {
  @ObjectIdColumn()
  _id: ObjectId;

  // Gom các chunk cùng một file upload. Sinh từ tên file + thời điểm upload.
  @Column()
  docId: string;

  // Tên tài liệu gốc (tên file) — để liệt kê và hiển thị nguồn.
  @Column()
  docTitle: string;

  // Nội dung đoạn (text thuần) — dùng làm context đưa cho Gemini diễn đạt.
  @Column()
  content: string;

  // Thứ tự đoạn trong tài liệu (0,1,2...) để giữ trật tự khi cần.
  @Column()
  chunkIndex: number;

  // Vector embedding (gemini-embedding-001, 768 chiều) sinh từ content.
  // Dùng cho Atlas Vector Search. Không trả về API công khai.
  @Column({ type: 'array', default: [] })
  embedding: number[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
