# Tích hợp Cloudinary cho ảnh sản phẩm — Giải thích từng bước

Tài liệu này giải thích từng bước cách tích hợp Cloudinary vào backend NestJS để upload và quản lý ảnh sản phẩm. Phần code đã được implement trong project. Đọc tài liệu này theo thứ tự sẽ giúp bạn hiểu **vì sao** mỗi file được viết ra như vậy.

---

## 0. Tổng quan kiến trúc

```
┌──────────┐         multipart/form-data         ┌──────────────┐
│  Client  │  ─────────────────────────────────► │   Backend    │
│ (Admin)  │     POST /products/:id/images       │   NestJS     │
└──────────┘                                     └──────┬───────┘
                                                        │
                                          buffer        │ upload_stream
                                                        ▼
                                                 ┌──────────────┐
                                                 │  Cloudinary  │
                                                 └──────┬───────┘
                                                        │ { url, public_id }
                                                        ▼
                                                 ┌──────────────┐
                                                 │   MongoDB    │
                                                 │  product.    │
                                                 │  images[]    │
                                                 └──────────────┘
```

**Flow:**
1. Admin gửi multipart request kèm 1–5 file ảnh đến backend
2. Multer (qua `FilesInterceptor`) parse file → đưa vào RAM dạng `Buffer`
3. `ParseFilePipe` validate size (≤5MB) và mime type (`image/*`)
4. `CloudinaryService.uploadImage()` stream buffer lên Cloudinary
5. Cloudinary trả về `{ secure_url, public_id }` → lưu vào `product.images[]` trong MongoDB
6. Khi xóa cứng product hoặc xóa 1 ảnh → gọi `cloudinary.uploader.destroy(publicId)` để cleanup

---

## 1. Cài dependencies

```bash
cd backend
npm install cloudinary multer-storage-cloudinary
npm install -D @types/multer
```

| Package | Vai trò |
|---------|---------|
| `cloudinary` | SDK chính thức để upload/delete asset |
| `multer-storage-cloudinary` | Storage engine (dự phòng — code hiện tại dùng `upload_stream` thủ công, không bắt buộc dùng package này) |
| `@types/multer` | Types cho `Express.Multer.File`, `FileInterceptor`, `@UploadedFile`. NestJS 11 **không kèm sẵn** — phải cài riêng |

> ⚠️ Nếu thiếu `@types/multer`, TypeScript sẽ báo `Cannot find namespace 'Express'` khi compile.

---

## 2. Khai báo Cloudinary Provider

**File:** `backend/src/cloudinary/cloudinary.provider.ts`

```ts
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY = 'CLOUDINARY';

export const CloudinaryProvider = {
  provide: CLOUDINARY,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    cloudinary.config({
      cloud_name: configService.get<string>('CLOUDINARY_NAME'),
      api_key: configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
    });
    return cloudinary;
  },
};
```

**Giải thích:**
- Đây là **factory provider** của NestJS — chạy 1 lần khi app khởi động.
- `cloudinary.config()` gán cấu hình vào module SDK toàn cục (instance singleton trong process).
- Trả về `cloudinary` để inject vào service khác qua token `CLOUDINARY`.
- Tách thành provider riêng (thay vì config trong service) để **test dễ hơn** — khi test có thể swap provider bằng mock.

---

## 3. Wrap SDK trong CloudinaryService

**File:** `backend/src/cloudinary/cloudinary.service.ts`

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { v2 as Cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.provider';

export interface UploadedImage {
  url: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(@Inject(CLOUDINARY) private readonly cloudinary: typeof Cloudinary) {}

  uploadImage(
    file: Express.Multer.File,
    folder = 'datn/products',
  ): Promise<UploadedImage> {
    return new Promise((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(error ?? new Error('Cloudinary upload failed'));
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      Readable.from(file.buffer).pipe(stream);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      const result = await this.cloudinary.uploader.destroy(publicId);
      if (result.result !== 'ok' && result.result !== 'not found') {
        this.logger.warn(`Cloudinary destroy returned: ${result.result} for ${publicId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${err}`);
    }
  }
}
```

**Vì sao dùng `upload_stream` thay vì `upload`?**
- `cloudinary.uploader.upload()` chỉ nhận **đường dẫn file** hoặc URL — không nhận buffer trực tiếp.
- Multer mặc định (`memoryStorage`) đưa file vào `file.buffer`, không lưu xuống disk.
- → Dùng `upload_stream` + `Readable.from(buffer).pipe(stream)` để stream thẳng buffer lên Cloudinary, không cần ghi disk tạm.

**Vì sao `deleteImage` swallow error?**
- Khi gọi `destroy` mà asset đã bị xóa hoặc chưa từng tồn tại → Cloudinary trả `{ result: 'not found' }`, không throw.
- Nhưng nếu mạng lỗi hoặc credentials sai → throw. Ở case này tui chỉ log warning, **không throw lên trên**, vì:
  - Khi xóa product hard delete, nếu Cloudinary fail thì vẫn nên cho phép xóa DB (tránh data DB còn ảnh không tham chiếu được).
  - Idempotent — gọi nhiều lần với cùng publicId không phá vỡ flow.

---

## 4. Đăng ký CloudinaryModule

**File:** `backend/src/cloudinary/cloudinary.module.ts`

```ts
import { Global, Module } from '@nestjs/common';
import { CloudinaryProvider } from './cloudinary.provider';
import { CloudinaryService } from './cloudinary.service';

@Global()
@Module({
  providers: [CloudinaryProvider, CloudinaryService],
  exports: [CloudinaryProvider, CloudinaryService],
})
export class CloudinaryModule {}
```

**`@Global()` để làm gì?**
- Module gắn `@Global()` → các provider của nó **không cần import lại** ở từng module sử dụng.
- Chỉ cần import `CloudinaryModule` **một lần** ở `AppModule`, sau đó `ProductsService` inject `CloudinaryService` thẳng được.

---

## 5. Import vào AppModule

**File:** `backend/src/app.module.ts`

```ts
import { CloudinaryModule } from './cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({ /* ... */ }),
    CloudinaryModule,   // ← thêm vào đây
    AuthModule,
    UsersModule,
    ProductsModule,
    CartModule,
  ],
  // ...
})
export class AppModule {}
```

**Thứ tự quan trọng:** `ConfigModule` phải đứng trước `CloudinaryModule` vì provider của Cloudinary dùng `ConfigService` để đọc env. NestJS resolve dependencies trong cùng module theo thứ tự khai báo — nhưng vì `ConfigModule` đã `isGlobal: true` nên thực tế thứ tự không quá quan trọng. Cứ đặt cho sạch.

---

## 6. Thêm biến môi trường

**File:** `backend/.env`

```env
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abc123xyz_your_secret
```

**Cách lấy:**
1. Đăng nhập [cloudinary.com](https://cloudinary.com)
2. Vào **Dashboard** → **Settings** (icon bánh răng) → tab **API Keys**
3. Copy 3 giá trị: `Cloud name`, `API Key`, `API Secret`

> ⚠️ KHÔNG commit `.env` lên git. File đã có sẵn trong `.gitignore` (kiểm tra lại nếu chưa).

---

## 7. Đổi schema Product entity

**File:** `backend/src/products/entities/product.entity.ts`

**Trước:**
```ts
@Column({ nullable: true })
imageUrl: string;
```

**Sau:**
```ts
@Column({ type: 'array', default: [] })
images: { url: string; publicId: string }[];
```

**Vì sao lưu cả `publicId`?**
- `url` là cái FE dùng để hiển thị (`<img src={url}>`).
- `publicId` là ID nội bộ của Cloudinary (vd `datn/products/abc123`) — cần để gọi `destroy()` sau này.
- Nếu chỉ lưu URL, khi muốn xóa ảnh sẽ phải parse URL ngược ra publicId → fragile và dễ sai khi URL có transformations.

**MongoDB lưu thế nào?**
```json
{
  "_id": "...",
  "name": "Phân NPK 16-16-8",
  "images": [
    {
      "url": "https://res.cloudinary.com/dxxx/image/upload/v1234/datn/products/abc.jpg",
      "publicId": "datn/products/abc"
    }
  ]
}
```

---

## 8. Cập nhật DTO

**File:** `backend/src/products/dto/create-product.dto.ts`

Bỏ field `imageUrl` (cùng `@IsUrl()` validator). Lý do:
- Ảnh upload qua endpoint riêng `POST /products/:id/images` **sau khi** product được tạo.
- Khi tạo product, không cần truyền URL ảnh — chỉ JSON metadata.
- Tách flow giúp xử lý lỗi gọn: tạo product fail ≠ upload ảnh fail.

---

## 9. Thêm endpoint upload vào Controller

**File:** `backend/src/products/products.controller.ts`

```ts
import {
  // ...
  UploadedFiles,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

@Roles(UserRole.ADMIN)
@Post(':id/images')
@UseInterceptors(FilesInterceptor('files', 5))
uploadImages(
  @Param('id') id: string,
  @UploadedFiles(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
        new FileTypeValidator({ fileType: /image\/(jpeg|png|webp|gif)/ }),
      ],
    }),
  )
  files: Express.Multer.File[],
) {
  return this.productsService.addImages(id, files);
}

@Roles(UserRole.ADMIN)
@HttpCode(HttpStatus.OK)
@Delete(':id/images')
removeImage(
  @Param('id') id: string,
  @Query('publicId') publicId: string,
) {
  return this.productsService.removeImage(id, publicId);
}
```

**Giải thích từng decorator:**

| Decorator | Vai trò |
|-----------|---------|
| `@Roles(UserRole.ADMIN)` | Chỉ admin được upload/delete (kết hợp với `RolesGuard` toàn cục) |
| `@UseInterceptors(FilesInterceptor('files', 5))` | Parse multipart, key form là `files`, tối đa 5 file/request |
| `@UploadedFiles(new ParseFilePipe(...))` | Inject array file + chạy validators |
| `MaxFileSizeValidator` | Chặn file > 5MB → 422 |
| `FileTypeValidator` | Chỉ chấp nhận jpeg/png/webp/gif → 422 |

**Vì sao DELETE dùng `?publicId=...` thay vì `:publicId` trong path?**
- `publicId` của Cloudinary chứa dấu `/` (vd `datn/products/abc123`).
- NestJS 11 dùng `path-to-regexp v8` — **không hỗ trợ** cú pháp wildcard cũ `:publicId(*)`. Cú pháp mới `*publicId` lại có hành vi khác.
- Đẩy publicId vào query param → tránh hoàn toàn vấn đề path encoding, đơn giản và rõ ràng hơn.

**Cách gọi từ client:**
```ts
// Upload
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);
await fetch(`/api/products/${id}/images`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});

// Delete
await fetch(
  `/api/products/${id}/images?publicId=${encodeURIComponent(publicId)}`,
  { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
);
```

---

## 10. Service xử lý logic

**File:** `backend/src/products/products.service.ts`

```ts
import { CloudinaryService } from '../cloudinary/cloudinary.service';

constructor(
  @InjectRepository(Product)
  private productsRepository: MongoRepository<Product>,
  private readonly cloudinaryService: CloudinaryService,
) {}

async addImages(id: string, files: Express.Multer.File[]): Promise<Product> {
  if (!files?.length) {
    throw new BadRequestException('Chưa có file nào được upload');
  }
  const product = await this.findOne(id);
  const uploaded = await Promise.all(
    files.map((f) => this.cloudinaryService.uploadImage(f)),
  );
  product.images = [...(product.images ?? []), ...uploaded];
  return this.productsRepository.save(product);
}

async removeImage(id: string, publicId: string): Promise<Product> {
  const product = await this.findOne(id);
  const existed = product.images?.some((img) => img.publicId === publicId);
  if (!existed) {
    throw new NotFoundException(`Không tìm thấy ảnh với publicId: ${publicId}`);
  }
  await this.cloudinaryService.deleteImage(publicId);
  product.images = product.images.filter((img) => img.publicId !== publicId);
  return this.productsRepository.save(product);
}
```

**Điểm cần lưu ý:**

1. **`Promise.all` để upload song song** — nếu user gửi 5 ảnh, upload đồng thời nhanh hơn nhiều so với tuần tự.
2. **`findOne(id)` đã throw `NotFoundException`** nếu không tìm thấy → không cần check lại.
3. **`removeImage` check tồn tại trước** — tránh trường hợp client gửi publicId rác mà vẫn báo success.
4. **Update `images` rồi save** — TypeORM với MongoDB cần `save()` để persist thay đổi array, không thể mutate trực tiếp.

### Hook cleanup khi xóa cứng product

```ts
async remove(id: string): Promise<{ message: string }> {
  const product = await this.findOne(id);
  if (product.images?.length) {
    await Promise.all(
      product.images.map((img) => this.cloudinaryService.deleteImage(img.publicId)),
    );
  }
  await this.productsRepository.remove(product);
  return { message: 'Đã xóa sản phẩm thành công' };
}
```

**Lưu ý:** `softDelete` (chỉ set `isActive = false`) **không xóa ảnh** — để khi `restore` lại còn ảnh dùng. Chỉ hard delete mới cleanup.

---

## 11. Sửa CartService

**File:** `backend/src/cart/cart.service.ts`

**Trước:** `imageUrl: product.imageUrl ?? ''`
**Sau:** `imageUrl: product.images?.[0]?.url ?? ''`

Cart response giữ nguyên field `imageUrl` để FE không phải đổi — chỉ thay nguồn lấy: ảnh đầu tiên trong array `images`.

---

## 12. Test thử

### Tạo product mới
```http
POST http://localhost:3000/api/products
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Phân NPK 16-16-8",
  "description": "Phân bón đa năng",
  "price": 250000,
  "stock": 100,
  "category": "phan_bon"
}
```
→ Response trả về product với `images: []`.

### Upload ảnh
```http
POST http://localhost:3000/api/products/{id}/images
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data

files: <file1.jpg>
files: <file2.png>
```
→ Response trả product với `images: [{ url, publicId }, ...]`.

### Xóa 1 ảnh
```http
DELETE http://localhost:3000/api/products/{id}/images?publicId=datn%2Fproducts%2Fabc123
Authorization: Bearer <admin_token>
```
→ Ảnh biến mất khỏi `images[]` và bị xóa trên Cloudinary.

### Xóa cứng product
```http
DELETE http://localhost:3000/api/products/{id}/permanent
Authorization: Bearer <admin_token>
```
→ Product bị xóa khỏi DB, toàn bộ ảnh bị xóa khỏi Cloudinary.

### Test lỗi
- Upload file > 5MB → `422 Unprocessable Entity`
- Upload file `.pdf` → `422 Unprocessable Entity`
- Upload không có token / user thường → `401 / 403`

---

## 13. Cấu trúc thư mục cuối cùng

```
backend/src/
├── cloudinary/                  ← MỚI
│   ├── cloudinary.module.ts
│   ├── cloudinary.provider.ts
│   └── cloudinary.service.ts
├── products/
│   ├── entities/product.entity.ts       ← sửa: images[]
│   ├── dto/create-product.dto.ts         ← sửa: bỏ imageUrl
│   ├── products.controller.ts            ← sửa: thêm 2 endpoint
│   ├── products.service.ts               ← sửa: addImages, removeImage, remove cleanup
│   └── products.module.ts
├── cart/
│   └── cart.service.ts                   ← sửa: images[0].url
├── app.module.ts                         ← sửa: import CloudinaryModule
└── ...
```

---

## 14. Tham khảo thêm

- [Cloudinary Node SDK docs](https://cloudinary.com/documentation/node_integration)
- [NestJS file upload](https://docs.nestjs.com/techniques/file-upload)
- [Multer memory storage](https://github.com/expressjs/multer#memorystorage)

---

## Phụ lục: Vì sao chọn cách này mà không phải cách khác?

| Lựa chọn | Cách đã làm | Lý do |
|---------|------------|-------|
| **Upload flow** | Backend nhận file → upload Cloudinary | An toàn (API secret không lộ FE), validate ở server |
| **Số ảnh/product** | Nhiều ảnh (`images[]`) | Hỗ trợ gallery, scale tốt hơn |
| **Cleanup** | Xóa Cloudinary khi hard delete | Tiết kiệm dung lượng, soft delete giữ ảnh để restore |
| **API design** | Tách endpoint upload riêng | Tạo product (JSON) và upload (multipart) độc lập, retry dễ |
| **Storage engine** | `memoryStorage` (default) | File nhỏ (~5MB), không cần ghi disk tạm |
| **Delete param** | Query `?publicId=...` | publicId có `/`, tránh phiền với path-to-regexp v8 |
