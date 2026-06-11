import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

// Một gợi ý địa chỉ trả về cho client (khớp shape gogoduk /v1/suggest).
export interface AddressPrediction {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

export interface SuggestResult {
  predictions: AddressPrediction[];
}

@Injectable()
export class AddressSuggestService {
  private readonly logger = new Logger(AddressSuggestService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Proxy gọi gogoduk /v1/suggest — giữ API key ở server, không lộ ra client.
   * Lỗi/giới hạn upstream → trả mảng rỗng để không làm vỡ form phía frontend.
   */
  async suggest(input: string): Promise<SuggestResult> {
    const query = (input ?? '').trim();
    if (query.length < 2) {
      return { predictions: [] };
    }

    const baseUrl = this.configService.get<string>('GOGODUK_API_URL');
    const apiKey = this.configService.get<string>('GOGODUK_API_KEY');

    if (!baseUrl || !apiKey) {
      this.logger.warn('Thiếu GOGODUK_API_URL hoặc GOGODUK_API_KEY trong .env');
      return { predictions: [] };
    }

    try {
      const res = await firstValueFrom(
        this.httpService.get<SuggestResult>(`${baseUrl}/v1/suggest`, {
          params: { input: query, lang: 'vi' },
          headers: { 'X-API-Key': apiKey },
        }),
      );
      // Đảm bảo luôn trả về shape { predictions: [] }
      return { predictions: res.data?.predictions ?? [] };
    } catch (err) {
      this.logger.error(
        `Gọi gogoduk thất bại: ${err instanceof Error ? err.message : err}`,
      );
      return { predictions: [] };
    }
  }
}
