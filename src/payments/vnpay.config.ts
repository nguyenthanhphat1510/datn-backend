// src/payments/vnpay.config.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cấu hình VNPay đọc từ biến môi trường (.env).
 * Tách riêng để VnpayService chỉ lo dựng/verify chữ ký.
 */
@Injectable()
export class VnpayConfig {
  constructor(private readonly config: ConfigService) {}

  /** Mã website (Terminal ID) do VNPay cấp. */
  get tmnCode(): string {
    return this.config.get<string>('VNP_TMN_CODE') ?? '';
  }

  /** Chuỗi bí mật để ký HMAC SHA512. */
  get hashSecret(): string {
    return this.config.get<string>('VNP_HASH_SECRET') ?? '';
  }

  /** URL cổng thanh toán sandbox (vpcpay.html). */
  get payUrl(): string {
    return (
      this.config.get<string>('VNP_URL') ??
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
    );
  }

  /** URL frontend mà VNPay redirect về sau khi thanh toán. */
  get returnUrl(): string {
    return (
      this.config.get<string>('VNP_RETURN_URL') ??
      'http://localhost:3001/thanh-toan/vnpay-return'
    );
  }
}
