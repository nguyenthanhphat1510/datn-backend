// src/dashboard/dashboard.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { DashboardStats, MonthlyRevenuePoint } from './dto/dashboard-stats.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: MongoRepository<Order>,
    @InjectRepository(User)
    private usersRepository: MongoRepository<User>,
    @InjectRepository(Product)
    private productsRepository: MongoRepository<Product>,
  ) {}

  /**
   * [Admin] Tổng hợp số liệu cho trang dashboard.
   * Trả về 3 phần: KPI tổng quan, đơn theo trạng thái, doanh thu 12 tháng.
   * Tính trên TOÀN BỘ dữ liệu (không phải theo trang) bằng MongoDB aggregation.
   */
  async getStats(): Promise<DashboardStats> {
    const [kpi, ordersByStatus, monthlyRevenue] = await Promise.all([
      this.getKpi(),
      this.getOrdersByStatus(),
      this.getMonthlyRevenue(),
    ]);

    return { kpi, ordersByStatus, monthlyRevenue };
  }

  /** KPI: doanh thu (đơn đã giao), tổng đơn, tổng user, tổng sản phẩm. */
  private async getKpi(): Promise<DashboardStats['kpi']> {
    const revenueAgg = await this.ordersRepository
      .aggregate([
        { $match: { status: OrderStatus.DELIVERED } },
        { $group: { _id: null, sum: { $sum: '$total' } } },
      ])
      .toArray();

    const [totalOrders, totalUsers, totalProducts] = await Promise.all([
      this.ordersRepository.count(),
      this.usersRepository.count({ role: UserRole.USER }),
      this.productsRepository.count(),
    ]);

    return {
      totalRevenue: (revenueAgg[0] as { sum: number })?.sum ?? 0,
      totalOrders,
      totalUsers,
      totalProducts,
    };
  }

  /** Đếm đơn theo từng trạng thái — luôn trả đủ 5 key (mặc định 0). */
  private async getOrdersByStatus(): Promise<DashboardStats['ordersByStatus']> {
    const rows = await this.ordersRepository
      .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray();

    // Khởi tạo đủ 5 status = 0 rồi đắp số đếm vào
    const result = Object.values(OrderStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as DashboardStats['ordersByStatus'],
    );

    for (const row of rows as { _id: OrderStatus; count: number }[]) {
      if (row._id in result) result[row._id] = row.count;
    }

    return result;
  }

  /**
   * Doanh thu (đơn đã giao) theo từng tháng, 12 tháng gần nhất.
   * Fill đủ 12 tháng (kể cả tháng doanh thu 0) để frontend khỏi xử lý khoảng trống.
   */
  private async getMonthlyRevenue(): Promise<MonthlyRevenuePoint[]> {
    const now = new Date();
    // Đầu tháng cách đây 11 tháng → tổng cộng 12 mốc tính cả tháng hiện tại
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const rows = await this.ordersRepository
      .aggregate([
        {
          $match: {
            status: OrderStatus.DELIVERED,
            createdAt: { $gte: start },
          },
        },
        {
          $group: {
            _id: {
              y: { $year: '$createdAt' },
              m: { $month: '$createdAt' },
            },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
      ])
      .toArray();

    // Map "YYYY-M" → số liệu để tra cứu nhanh khi fill
    const byKey = new Map<string, { revenue: number; orders: number }>();
    for (const row of rows as {
      _id: { y: number; m: number };
      revenue: number;
      orders: number;
    }[]) {
      byKey.set(`${row._id.y}-${row._id.m}`, {
        revenue: row.revenue,
        orders: row.orders,
      });
    }

    const points: MonthlyRevenuePoint[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1; // 1-based để khớp $month của Mongo
      const hit = byKey.get(`${y}-${m}`);
      points.push({
        month: `${y}-${String(m).padStart(2, '0')}`,
        label: `T${m}`,
        revenue: hit?.revenue ?? 0,
        orders: hit?.orders ?? 0,
      });
    }

    return points;
  }
}
