// src/dashboard/dto/dashboard-stats.dto.ts

import { OrderStatus } from '../../orders/entities/order.entity';

/** Một mốc doanh thu theo tháng (dùng cho biểu đồ). */
export interface MonthlyRevenuePoint {
  month: string; // "YYYY-MM" — khóa định danh
  label: string; // "T6" — nhãn hiển thị trên trục biểu đồ
  revenue: number; // Tổng doanh thu (đơn đã giao) trong tháng
  orders: number; // Số đơn đã giao trong tháng
}

/** Hợp đồng response của GET /dashboard/stats. */
export interface DashboardStats {
  kpi: {
    totalRevenue: number; // Doanh thu từ các đơn đã giao
    totalOrders: number; // Tổng số đơn (mọi trạng thái)
    totalUsers: number; // Tổng user thường (không tính admin)
    totalProducts: number; // Tổng sản phẩm
  };
  ordersByStatus: Record<OrderStatus, number>; // Đủ 5 status
  monthlyRevenue: MonthlyRevenuePoint[]; // 12 tháng gần nhất, đủ mốc
}
