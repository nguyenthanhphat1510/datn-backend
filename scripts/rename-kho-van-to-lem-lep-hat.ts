/**
 * Đổi bệnh "Khô vằn" (slug kho-van) thành "Lem lép hạt" (slug lem-lep-hat)
 * trong collection `diseases`: thay name + symptoms + description, sinh LẠI
 * embedding (vì vector phụ thuộc các trường text này), cập nhật slug. Giữ nguyên
 * recommendedProductIds và images đang có.
 *
 * Cách chạy (từ thư mục backend/):
 *   npx ts-node scripts/rename-kho-van-to-lem-lep-hat.ts
 *
 * Lưu ý:
 * - Đọc MONGODB_URI và GEMINI_API_KEY từ .env (giống seed-diseases.ts).
 * - Idempotent: chạy lại nhiều lần vẫn ra cùng kết quả; nếu đã đổi rồi thì cập
 *   nhật theo slug mới lem-lep-hat. Nếu không tìm thấy cả hai slug → báo và thoát.
 * - Embedding sinh giống EmbeddingService: taskType RETRIEVAL_DOCUMENT,
 *   outputDimensionality 768, rồi L2-normalize.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;

const OLD_SLUG = 'kho-van';
const NEW_SLUG = 'lem-lep-hat';

/** L2-normalize: |v| = 1 (khớp EmbeddingService). */
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
}

// Nội dung mới cho bệnh Lem lép hạt. symptoms ghi nhiều cách diễn đạt để vector
// (và người dùng gõ tự do) khớp tốt hơn.
const NEW_CONTENT = {
  name: 'Lem lép hạt',
  symptoms: [
    'hạt lúa lép lửng không vào chắc',
    'vỏ hạt có vết đốm nâu đen loang lổ',
    'hạt biến màu nâu, đen hoặc bạc trắng',
    'bông lúa nhiều hạt lép, hạt thối',
    'hạt mất màu sáng, xỉn màu, giảm chất lượng gạo',
  ],
  description:
    'Bệnh lem lép hạt do nhiều loại nấm và vi khuẩn cùng tấn công bông và hạt lúa giai đoạn trổ - vào chắc (Curvularia, Fusarium, Bipolaris, Pseudomonas...). Hạt bị lép lửng, vỏ trấu có vết đốm nâu đen loang lổ, hạt biến màu làm giảm năng suất và chất lượng gạo. Bệnh nặng khi gặp mưa nhiều, ẩm độ cao lúc lúa trổ và bón thừa đạm.',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!uri) {
    console.error('Thiếu MONGODB_URI trong .env');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Thiếu GEMINI_API_KEY trong .env (cần để sinh embedding)');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  async function embed(text: string): Promise<number[]> {
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIM },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length === 0) throw new Error('Embedding rỗng');
    return normalize(values);
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log('✅ Kết nối MongoDB thành công');

  try {
    const diseases = client.db().collection('diseases');

    // Tìm theo slug cũ; nếu đã đổi rồi thì tìm theo slug mới để chạy lại được.
    let target = await diseases.findOne({ slug: OLD_SLUG });
    if (!target) {
      target = await diseases.findOne({ slug: NEW_SLUG });
      if (target) {
        console.log(
          `ℹ️  Không còn bệnh slug "${OLD_SLUG}", đã tồn tại "${NEW_SLUG}" — cập nhật lại nội dung.`,
        );
      }
    }
    if (!target) {
      console.error(
        `❌ Không tìm thấy bệnh với slug "${OLD_SLUG}" hoặc "${NEW_SLUG}". Không có gì để đổi.`,
      );
      process.exit(1);
    }

    // Tránh đụng slug đang dùng bởi bệnh KHÁC (an toàn dữ liệu).
    const dup = await diseases.findOne({
      slug: NEW_SLUG,
      _id: { $ne: target._id },
    });
    if (dup) {
      console.error(
        `❌ Slug "${NEW_SLUG}" đã được dùng bởi bệnh khác (id=${String(dup._id)}). Hủy để tránh trùng.`,
      );
      process.exit(1);
    }

    const text = [
      NEW_CONTENT.name,
      NEW_CONTENT.symptoms.join('. '),
      NEW_CONTENT.description,
    ].join('. ');

    process.stdout.write(`⏳ Sinh lại embedding cho "${NEW_CONTENT.name}"... `);
    const embedding = await embed(text);
    console.log(`xong (${embedding.length} chiều)`);

    await diseases.updateOne(
      { _id: target._id },
      {
        $set: {
          name: NEW_CONTENT.name,
          slug: NEW_SLUG,
          symptoms: NEW_CONTENT.symptoms,
          description: NEW_CONTENT.description,
          embedding,
          updatedAt: new Date(),
        },
      },
    );

    console.log(
      `\n✅ Đã đổi bệnh (id=${String(target._id)}): "${target.name}" [${target.slug}] → "${NEW_CONTENT.name}" [${NEW_SLUG}]`,
    );
    console.log(
      `   Giữ nguyên recommendedProductIds (${(target.recommendedProductIds ?? []).length}) và images (${(target.images ?? []).length}).`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('❌ Đổi bệnh thất bại:', err);
  process.exit(1);
});
