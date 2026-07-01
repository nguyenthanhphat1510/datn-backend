import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { DiseasesService } from './diseases.service';
import { Disease } from './entities/disease.entity';

// Một dự đoán thô trả về từ ml-service (FastAPI).
interface RawPrediction {
  class: string; // slug, khớp Disease.slug
  label: string; // tên hiển thị
  confidence: number; // 0..1
}

interface MlPredictResponse {
  predictions: RawPrediction[];
  top: RawPrediction;
}

// Một dự đoán đã được "làm giàu" bằng thông tin bệnh trong DB (nếu khớp slug).
export interface EnrichedPrediction extends RawPrediction {
  // Thông tin bệnh trong DB nếu tìm thấy theo slug; null nếu model nhận ra class
  // nhưng DB chưa có bản ghi tương ứng.
  disease: Disease | null;
}

export interface PredictResult {
  predictions: EnrichedPrediction[];
  top: EnrichedPrediction;
}

@Injectable()
export class DiseasePredictionService {
  private readonly logger = new Logger(DiseasePredictionService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly diseasesService: DiseasesService,
  ) {}

  /**
   * Gửi ảnh lá lúa sang ml-service để dự đoán, rồi map mỗi class (slug) với bản
   * ghi Disease trong MongoDB để FE có sẵn mô tả + thuốc gợi ý.
   */
  async predict(file: Express.Multer.File): Promise<PredictResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Thiếu file ảnh');
    }

    const baseUrl = this.configService.get<string>('ML_SERVICE_URL');
    if (!baseUrl) {
      this.logger.error('Thiếu ML_SERVICE_URL trong .env');
      throw new ServiceUnavailableException('Dịch vụ dự đoán chưa được cấu hình');
    }

    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname || 'leaf.jpg',
      contentType: file.mimetype,
    });

    let data: MlPredictResponse;
    try {
      const res = await firstValueFrom(
        this.httpService.post<MlPredictResponse>(`${baseUrl}/predict`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          timeout: 30_000,
        }),
      );
      data = res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gọi ml-service thất bại: ${msg}`);
      throw new ServiceUnavailableException(
        'Không kết nối được dịch vụ dự đoán bệnh',
      );
    }

    const predictions = await this.enrichAll(data.predictions);
    return {
      predictions,
      top: predictions[0],
    };
  }

  /** Map từng dự đoán với Disease theo slug. Bỏ qua bệnh không tìm thấy (disease=null). */
  private async enrichAll(raw: RawPrediction[]): Promise<EnrichedPrediction[]> {
    return Promise.all(
      raw.map(async (p) => ({
        ...p,
        disease: await this.findDiseaseBySlug(p.class),
      })),
    );
  }

  /** Tìm Disease theo slug; trả null nếu DB chưa có (không ném lỗi). */
  private async findDiseaseBySlug(slug: string): Promise<Disease | null> {
    try {
      return await this.diseasesService.findBySlugPublic(slug);
    } catch {
      return null;
    }
  }
}
