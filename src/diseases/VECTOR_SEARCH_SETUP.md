# Thiết lập Atlas Vector Search cho collection `diseases`

Nhánh `trieu_chung` của chatbot dùng **MongoDB Atlas Vector Search** để tìm bệnh
gần nghĩa nhất với mô tả triệu chứng của người dùng (RAG). Để `$vectorSearch`
chạy được, **bắt buộc** phải tạo một Vector Search Index trên Atlas.

> Index này tạo **một lần** trên Atlas UI. Code không tự tạo được (cần quyền vào
> tài khoản Atlas). Nếu chưa tạo, chatbot vẫn chạy nhưng nhánh chẩn đoán sẽ trả
> lời an toàn ("mình chưa nhận ra...") và log lỗi vector search trong console.

## Thông số đã chốt (phải khớp với code)

| Thông số | Giá trị | Khai báo ở đâu trong code |
|---|---|---|
| Model embedding | `gemini-embedding-001` | `EMBEDDING_MODEL` — embedding.service.ts |
| Số chiều | **768** | `EMBEDDING_DIM` — embedding.service.ts |
| Hàm khoảng cách | `cosine` | (vector đã được L2-normalize) |
| Tên index | `disease_vector_index` | `DISEASE_VECTOR_INDEX` — chatbot.service.ts |
| Field chứa vector | `embedding` | disease.entity.ts |

## Các bước tạo index

1. Đăng nhập [MongoDB Atlas](https://cloud.mongodb.com) → chọn cluster `Cluster0`.
2. Vào tab **Atlas Search** (hoặc **Search & Vector Search**).
3. Bấm **Create Search Index** → chọn loại **Vector Search** (KHÔNG phải Search thường).
4. Chọn:
   - Database: `DATN`
   - Collection: `diseases`
   - Index Name: `disease_vector_index`
5. Dán JSON định nghĩa sau:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}
```

6. Bấm **Create** và đợi trạng thái index chuyển sang **Active** (vài phút).

## Sau khi tạo

- Các bệnh **tạo/sửa qua admin** sẽ tự sinh `embedding` (768 chiều) và được index.
- Bệnh **đã tạo trước khi có embedding** sẽ có `embedding: []` → không match được.
  Cần mở từng bệnh trong admin và **Lưu lại** (hoặc đổi nhẹ rồi lưu) để sinh embedding.
- Thử: vào chatbot, mô tả một triệu chứng có trong `symptoms` của một bệnh →
  bot sẽ chẩn đoán và gợi ý thuốc.

## Lưu ý

- Atlas tier **M0 (free)** có hỗ trợ Vector Search.
- Nếu đổi `EMBEDDING_DIM` trong code, phải xóa & tạo lại index với `numDimensions` mới,
  đồng thời re-embed lại toàn bộ bệnh (lưu lại trong admin).
