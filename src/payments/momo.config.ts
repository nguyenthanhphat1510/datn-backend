// src/payments/momo.config.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cấu hình MoMo đọc từ biến môi trường (.env).
 * Tách riêng để MomoService chỉ lo dựng request/verify chữ ký.
 */
@Injectable()
export class MomoConfig {
  constructor(private readonly config: ConfigService) {}

  /** Mã đối tác do MoMo cấp (sandbox dùng 'MOMO'). */
  get partnerCode(): string {
    return this.config.get<string>('MOMO_PARTNER_CODE') ?? 'MOMO';
  }

  /** Access key do MoMo cấp. */
  get accessKey(): string {
    return this.config.get<string>('MOMO_ACCESS_KEY') ?? '';
  }

  /** Secret key để ký HMAC SHA256. */
  get secretKey(): string {
    return this.config.get<string>('MOMO_SECRET_KEY') ?? '';
  }

  /** Endpoint tạo giao dịch của MoMo (sandbox). */
  get endpoint(): string {
    return (
      this.config.get<string>('MOMO_ENDPOINT') ??
      'https://test-payment.momo.vn/v2/gateway/api/create'
    );
  }

  /** URL frontend mà MoMo redirect khách về sau khi thanh toán. */
  get redirectUrl(): string {
    return (
      this.config.get<string>('MOMO_REDIRECT_URL') ??
      'http://localhost:3001/thanh-toan/momo-return'
    );
  }

  /** URL IPN (server→server). Trên localhost MoMo không gọi tới được — chỉ để thỏa field bắt buộc. */
  get ipnUrl(): string {
    return (
      this.config.get<string>('MOMO_IPN_URL') ??
      'http://localhost:3001/thanh-toan/momo-return'
    );
  }
}
