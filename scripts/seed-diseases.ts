/**
 * Seed vài bệnh lúa phổ biến vào collection `diseases`, kèm sinh embedding
 * (gemini-embedding-001, 768 chiều) để Atlas Vector Search dùng được ngay.
 *
 * Cách chạy (từ thư mục backend/):
 *   npx ts-node scripts/seed-diseases.ts
 *
 * Lưu ý:
 * - Đọc MONGODB_URI và GEMINI_API_KEY từ .env (giống AppModule / EmbeddingService).
 * - Idempotent theo slug: bệnh đã tồn tại sẽ được CẬP NHẬT (kể cả embedding),
 *   không tạo trùng.
 * - recommendedProductIds để rỗng — vào admin gắn thuốc sau, hoặc tự thêm id ở đây.
 * - Embedding sinh giống hệt EmbeddingService: taskType RETRIEVAL_DOCUMENT,
 *   outputDimensionality 768, rồi L2-normalize.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** L2-normalize: |v| = 1 (khớp EmbeddingService vì cắt < 3072 chiều). */
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
}

type SeedDisease = {
  name: string;
  symptoms: string[];
  description: string;
};

// Bệnh lúa phổ biến ở Việt Nam. symptoms ghi nhiều cách diễn đạt để vector
// (và cả người dùng gõ tự do) khớp tốt hơn.
const SEED: SeedDisease[] = [
  {
    name: 'Đạo ôn lá',
    symptoms: [
      'lá có vết hình thoi',
      'vết bệnh màu nâu, viền nâu đậm, giữa xám trắng',
      'đốm hình mắt én trên lá',
      'lá khô cháy từng mảng',
      'vết bệnh lan rộng làm lá cháy',
    ],
    description:
      'Bệnh đạo ôn do nấm Pyricularia oryzae gây ra, xuất hiện trên lá với vết hình thoi (mắt én) màu nâu, giữa xám trắng. Bệnh nặng làm lá cháy khô, giảm năng suất rõ rệt, phát triển mạnh khi ẩm độ cao và bón thừa đạm.',
  },
  {
    name: 'Đạo ôn cổ bông',
    symptoms: [
      'cổ bông bị thâm đen',
      'bông lúa bị gãy gục',
      'hạt lép nhiều',
      'cổ gié thối đen',
      'bông bạc trắng không vào hạt',
    ],
    description:
      'Đạo ôn cổ bông tấn công cổ bông và cổ gié giai đoạn trổ, làm cổ bông thâm đen, bông gãy gục, hạt lép lửng. Đây là dạng đạo ôn nguy hiểm nhất vì gây mất năng suất nặng.',
  },
  {
    name: 'Bạc lá (cháy bìa lá)',
    symptoms: [
      'mép lá khô cháy từ đầu lá vào',
      'vết cháy màu vàng rồi trắng xám',
      'bìa lá khô như bị nước sôi',
      'lá héo từ chóp lá lan xuống',
      'sọc dài dọc mép lá',
    ],
    description:
      'Bệnh bạc lá do vi khuẩn Xanthomonas oryzae gây ra, vết bệnh bắt đầu từ chóp và mép lá lan dần vào trong, chuyển vàng rồi trắng xám. Lây lan nhanh trong điều kiện mưa gió, ngập nước.',
  },
  {
    name: 'Khô vằn',
    symptoms: [
      'vết bệnh hình bầu dục loang lổ ở bẹ lá',
      'vết vằn da hổ màu xám xanh',
      'bẹ lá gần gốc bị thối',
      'vết bệnh lan từ bẹ lên phiến lá',
      'lúa đổ ngã do bẹ thối',
    ],
    description:
      'Bệnh khô vằn do nấm Rhizoctonia solani gây ra, vết bệnh loang lổ hình vằn da hổ ở bẹ lá sát mặt nước, lan dần lên trên. Bệnh nặng làm bẹ thối, cây dễ đổ ngã, phát triển mạnh khi ruộng rậm rạp, bón nhiều đạm.',
  },
  {
    name: 'Vàng lùn - lùn xoắn lá',
    symptoms: [
      'cây lúa lùn thấp bất thường',
      'lá vàng từ chóp lá',
      'lá bị xoắn vặn',
      'cây đẻ nhánh nhiều nhưng còi cọc',
      'lá ngắn dựng đứng màu vàng',
    ],
    description:
      'Bệnh vàng lùn và lùn xoắn lá do virus gây ra, lan truyền qua rầy nâu. Cây bị lùn, lá vàng cam, xoắn vặn, đẻ nhánh nhiều nhưng không trổ bông hoặc trổ kém. Phòng bệnh chủ yếu bằng quản lý rầy nâu.',
  },
  {
    name: 'Đốm nâu',
    symptoms: [
      'lá có nhiều đốm nâu tròn nhỏ',
      'đốm nâu rải rác như hạt vừng',
      'đốm tròn màu nâu sẫm viền vàng',
      'hạt lúa có đốm nâu',
      'lá già nhiều chấm nâu',
    ],
    description:
      'Bệnh đốm nâu do nấm Bipolaris oryzae gây ra, biểu hiện là nhiều đốm nâu tròn nhỏ rải rác trên lá và vỏ hạt. Thường gặp trên ruộng thiếu dinh dưỡng, đất phèn, nghèo kali.',
  },
];

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

    let created = 0;
    let updated = 0;
    for (const d of SEED) {
      const slug = slugify(d.name);
      const text = [d.name, d.symptoms.join('. '), d.description].join('. ');

      process.stdout.write(`⏳ Embedding "${d.name}"... `);
      const embedding = await embed(text);
      console.log(`xong (${embedding.length} chiều)`);

      const existing = await diseases.findOne({ slug });
      if (existing) {
        await diseases.updateOne(
          { slug },
          {
            $set: {
              name: d.name,
              symptoms: d.symptoms,
              description: d.description,
              embedding,
              updatedAt: new Date(),
            },
          },
        );
        updated++;
      } else {
        await diseases.insertOne({
          name: d.name,
          slug,
          symptoms: d.symptoms,
          description: d.description,
          recommendedProductIds: [],
          images: [],
          embedding,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        created++;
      }
    }

    console.log(`\n✅ Seed hoàn tất — Tạo mới: ${created}, Cập nhật: ${updated}`);
    console.log(
      'Lưu ý: vào admin /diseases để gắn thuốc gợi ý (recommendedProductIds) cho từng bệnh.',
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('❌ Seed thất bại:', err);
  process.exit(1);
});
