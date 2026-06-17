// src/dashboard/dashboard.controller.ts

import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('dashboard') // Prefix: /dashboard
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * [Admin] GET /dashboard/stats
   * Số liệu tổng hợp cho trang dashboard: KPI, đơn theo trạng thái, doanh thu tháng.
   * TODO: bật lại @Roles(UserRole.ADMIN) khi bật phân quyền cho admin frontend.
   */
  @Public()
  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }
}
