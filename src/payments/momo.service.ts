// src/payments/momo.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { MomoConfig } from './momo.config';

export interface CreatePaymentParams {
  orderId: string; // Mã đơn gửi MoMo (duy nhất mỗi lần tạo)
  amount: number; // Số tiền (VND)
  orderInfo: string; // Mô tả đơn hàng
}

export interface VerifyReturnResult {
  valid: boolean; // Chữ ký có khớp không
  orderId: string; // orderId MoMo trả về (= paymentTxnRef của ta)
  resultCode: string; // '0' = thành công
  transId: string; // Mã giao dịch MoMo
}

/**
 * Dịch vụ xử lý giao thức MoMo (AIO/captureWallet):
 *  - createPayment: POST server→server tới MoMo, nhận payUrl.
 *  - verifyReturn: verify chữ ký HMAC SHA256 khi MoMo redirect khách về.
 *
 * Tham chiếu code mẫu chính thức MoMo (nodejs). Chữ ký dùng rawSignature
 * với THỨ TỰ FIELD CỐ ĐỊNH (không sort như VNPay).
 */
@Injectable()
export class MomoService {
  constructor(
    private readonly cfg: MomoConfig,
    private readonly http: HttpService,
  ) {}

  /**
   * Gọi MoMo tạo giao dịch, trả về payUrl để frontend redirect.
   * Ném BadRequestException nếu MoMo trả resultCode !== 0.
   */
  async createPayment(params: CreatePaymentParams): Promise<string> {
    const { partnerCode, accessKey, secretKey, endpoint, redirectUrl, ipnUrl } =
      this.cfg;

    const requestId = params.orderId; // dùng chung, đảm bảo duy nhất
    const orderId = params.orderId;
    const amount = String(Math.round(params.amount));
    const orderInfo = params.orderInfo;
    // payWithATM → MoMo hiện form nhập thẻ ATM nội địa (thay vì màn QR ví MoMo).
    const requestType = 'payWithATM';
    const extraData = '';

    // rawSignature THỨ TỰ CỐ ĐỊNH theo tài liệu MoMo — KHÔNG sort.
    const rawSignature =
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}` +
      `&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}&requestType=${requestType}`;

    const signature = this.sign(rawSignature, secretKey);

    const body = {
      partnerCode,
      accessKey,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData,
      requestType,
      signature,
      lang: 'vi',
    };

    let data: any;
    try {
      const res = await firstValueFrom(
        this.http.post(endpoint, body, {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      data = res.data;
    } catch {
      throw new BadRequestException('Không kết nối được tới cổng MoMo');
    }

    // resultCode 0 = tạo giao dịch thành công, có payUrl
    if (data?.resultCode !== 0 || !data?.payUrl) {
      throw new BadRequestException(
        data?.message
          ? `MoMo: ${data.message}`
          : 'Tạo giao dịch MoMo thất bại',
      );
    }

    return data.payUrl as string;
  }

  /**
   * Verify query MoMo redirect về. Ký lại trên rawSignature của return
   * (thứ tự field cố định) và so khớp timing-safe.
   */
  verifyReturn(query: Record<string, any>): VerifyReturnResult {
    const g = (k: string) => String(query[k] ?? '');
    const { accessKey, secretKey } = this.cfg;

    // rawSignature của return — thứ tự field cố định theo tài liệu MoMo.
    const rawSignature =
      `accessKey=${accessKey}&amount=${g('amount')}&extraData=${g('extraData')}` +
      `&message=${g('message')}&orderId=${g('orderId')}&orderInfo=${g('orderInfo')}` +
      `&orderType=${g('orderType')}&partnerCode=${g('partnerCode')}` +
      `&payType=${g('payType')}&requestId=${g('requestId')}` +
      `&responseTime=${g('responseTime')}&resultCode=${g('resultCode')}` +
      `&transId=${g('transId')}`;

    const expected = this.sign(rawSignature, secretKey);
    const received = g('signature');

    return {
      valid: this.safeEqual(received, expected),
      orderId: g('orderId'),
      resultCode: g('resultCode'),
      transId: g('transId'),
    };
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  /** Ký HMAC SHA256 → hex. */
  private sign(data: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(data, 'utf-8'))
      .digest('hex');
  }

  /** So sánh chữ ký chống timing attack; trả false nếu lệch độ dài. */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
