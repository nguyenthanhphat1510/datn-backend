/**
 * Tính phí vận chuyển theo khoảng cách (Haversine) từ kho shop tới địa chỉ nhận.
 *
 * LƯU Ý: SHOP_LOCATION lat/lon ở đây phải ĐỒNG BỘ với frontend
 * (frontend/src/lib/shop-location.ts). Hai package không chia sẻ code nên
 * giữ tay; nếu đổi vị trí shop nhớ sửa cả hai nơi.
 */

// Toạ độ kho — Trường ĐH Kỹ thuật - Công nghệ Cần Thơ.
export const SHOP_LOCATION = { lat: 10.0467807, lon: 105.7680453 } as const;

export const FREE_SHIP_THRESHOLD = 500_000; // đơn >= ngưỡng này được miễn phí ship

const BASE_FEE = 15_000; // phí cho <= 5km (cũng là fallback khi thiếu toạ độ)
const FREE_DISTANCE_KM = 5; // số km đầu tính phí base
const FEE_PER_KM = 3_000; // phí mỗi km vượt FREE_DISTANCE_KM
const MAX_FEE = 60_000; // trần phí ship

interface LatLon {
  lat: number;
  lon: number;
}

/** Khoảng cách giữa 2 điểm theo công thức Haversine (km). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371; // bán kính trái đất (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Tính phí ship từ kho tới (lat, lon).
 * - subtotal >= FREE_SHIP_THRESHOLD → miễn phí.
 * - thiếu lat/lon (địa chỉ cũ chưa resolve) → phí base (như trong 5km).
 * - còn lại: BASE_FEE + (ceil(km) - 5) * FEE_PER_KM, cap MAX_FEE.
 */
export function calcShippingFee(
  subtotal: number,
  lat?: number,
  lon?: number,
): { fee: number; distanceKm: number | null } {
  if (subtotal >= FREE_SHIP_THRESHOLD) {
    return { fee: 0, distanceKm: null };
  }

  if (lat == null || lon == null) {
    return { fee: BASE_FEE, distanceKm: null };
  }

  const distanceKm = haversineKm(SHOP_LOCATION, { lat, lon });
  const extraKm = Math.max(0, Math.ceil(distanceKm) - FREE_DISTANCE_KM);
  const fee = Math.min(BASE_FEE + extraKm * FEE_PER_KM, MAX_FEE);
  return { fee, distanceKm };
}
