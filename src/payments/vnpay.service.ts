// src/payments/vnpay.service.ts

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { VnpayConfig } from './vnpay.config';

export interface BuildPaymentUrlParams {
  txnRef: string; // Mã tham chiếu đơn (vnp_TxnRef) — duy nhất trong ngày
  amount: number; // Số tiền (VND, chưa nhân 100)
  orderInfo: string; // Mô tả đơn hàng
  ipAddr: string; // IP của khách
}

export interface VerifyReturnResult {
  valid: boolean; // Chữ ký có khớp không
  txnRef: string; // vnp_TxnRef
  responseCode: string; // vnp_ResponseCode ('00' = thành công)
  transactionNo: string; // vnp_TransactionNo (mã GD của VNPay)
}

/**
 * Dịch vụ thuần xử lý giao thức VNPay: dựng URL thanh toán và verify chữ ký
 * khi VNPay redirect về. Không phụ thuộc DB — chỉ làm việc với params + crypto.
 *
 * Tham chiếu code mẫu chính thức của VNPay (Node.js):
 * sort key theo alphabet → stringify với encodeURIComponent (space → '+') →
 * ký HMAC SHA512 bằng hashSecret.
 */
@Injectable()
export class VnpayService {
  constructor(private readonly cfg: VnpayConfig) {}

  /** Dựng URL thanh toán hoàn chỉnh để redirect khách sang VNPay. */
  buildPaymentUrl(params: BuildPaymentUrlParams): string {
    const createDate = this.formatDate(new Date());

    const vnpParams: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.cfg.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: params.txnRef,
      vnp_OrderInfo: params.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: String(Math.round(params.amount) * 100), // VNPay yêu cầu *100
      vnp_ReturnUrl: this.cfg.returnUrl,
      vnp_IpAddr: params.ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    const sorted = this.sortObject(vnpParams);
    const signData = this.buildQuery(sorted); // chữ ký ký trên chuỗi đã encode
    const secureHash = this.sign(signData);

    return `${this.cfg.payUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  }

  /**
   * Verify query VNPay redirect về. Tách vnp_SecureHash, ký lại phần còn lại
   * và so sánh (so khớp an toàn theo timing).
   */
  verifyReturn(query: Record<string, any>): VerifyReturnResult {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) {
      if (k === 'vnp_SecureHash' || k === 'vnp_SecureHashType') continue;
      params[k] = String(v);
    }

    const received = String(query.vnp_SecureHash ?? '');
    const sorted = this.sortObject(params);
    const signData = this.buildQuery(sorted);
    const expected = this.sign(signData);

    return {
      valid: this.safeEqual(received, expected),
      txnRef: String(query.vnp_TxnRef ?? ''),
      responseCode: String(query.vnp_ResponseCode ?? ''),
      transactionNo: String(query.vnp_TransactionNo ?? ''),
    };
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  /** Ký HMAC SHA512 → hex. */
  private sign(data: string): string {
    return crypto
      .createHmac('sha512', this.cfg.hashSecret)
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

  /** Sắp xếp key theo alphabet — VNPay yêu cầu để chữ ký nhất quán. */
  private sortObject(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = obj[key];
    }
    return sorted;
  }

  /**
   * Encode params thành query string theo đúng cách VNPay:
   * encodeURIComponent rồi thay '%20' → '+' (giống qs với space → '+').
   */
  private buildQuery(obj: Record<string, string>): string {
    return Object.entries(obj)
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%20/g, '+')}`,
      )
      .join('&');
  }

  /** Định dạng ngày theo yyyyMMddHHmmss (giờ VN). */
  private formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    // Quy đổi sang giờ Việt Nam (UTC+7) để khớp thời gian VNPay
    const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return (
      `${vn.getUTCFullYear()}` +
      `${pad(vn.getUTCMonth() + 1)}` +
      `${pad(vn.getUTCDate())}` +
      `${pad(vn.getUTCHours())}` +
      `${pad(vn.getUTCMinutes())}` +
      `${pad(vn.getUTCSeconds())}`
    );
  }
}
