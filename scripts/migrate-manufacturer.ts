/**
 * One-shot migration: chuẩn hóa field `manufacturer` của Product từ string tự do
 * sang ObjectId tham chiếu đến collection `manufacturers`.
 *
 * Cách chạy (từ thư mục backend/):
 *   npx ts-node scripts/migrate-manufacturer.ts
 *
 * Lưu ý:
 * - Backup DB trước khi chạy.
 * - Idempotent: chạy nhiều lần an toàn — bản ghi đã là ObjectId hợp lệ sẽ skip.
 * - Đọc MONGODB_URI từ .env (giống AppModule).
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Thiếu MONGODB_URI trong .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log('✅ Kết nối MongoDB thành công');

  try {
    const db = client.db();
    const products = db.collection('products');
    const manufacturers = db.collection('manufacturers');

    // 1. Distinct manufacturer strings trong products
    const allValues: string[] = await products.distinct('manufacturer');
    const stringNames = allValues
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .filter((v) => !ObjectId.isValid(v)); // bỏ qua những bản ghi đã là ObjectId

    console.log(`📋 Tìm thấy ${stringNames.length} tên nhà sản xuất dạng string cần migrate`);

    if (stringNames.length === 0) {
      console.log('Không có gì để migrate. Hoàn tất.');
      return;
    }

    // 2. Tạo / tìm bản ghi Manufacturer cho từng tên
    const nameToId = new Map<string, string>();
    let created = 0;
    let reused = 0;
    for (const name of stringNames) {
      const slug = slugify(name);
      let doc = await manufacturers.findOne({ slug });
      if (!doc) {
        const insert = await manufacturers.insertOne({
          name,
          slug,
          description: null,
          logo: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        doc = await manufacturers.findOne({ _id: insert.insertedId });
        created++;
      } else {
        reused++;
      }
      if (doc) {
        nameToId.set(name, doc._id.toString());
      }
    }
    console.log(`🆕 Tạo mới: ${created}, ♻️  Dùng lại: ${reused}`);

    // 3. Update từng product: thay string manufacturer bằng _id string
    let updated = 0;
    for (const [name, id] of nameToId.entries()) {
      const res = await products.updateMany(
        { manufacturer: name },
        { $set: { manufacturer: id, updatedAt: new Date() } },
      );
      updated += res.modifiedCount;
    }
    console.log(`✏️  Cập nhật ${updated} product`);

    console.log('✅ Migration hoàn tất');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('❌ Migration thất bại:', err);
  process.exit(1);
});
