import { Module } from '@nestjs/common';
import { CooperativesModule } from '../cooperatives/cooperatives.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [CooperativesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
