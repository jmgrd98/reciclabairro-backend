import { Module } from '@nestjs/common';
import { RegionsModule } from '../regions/regions.module.js';
import {
  AdminSchedulesController,
  SchedulesController,
} from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  imports: [RegionsModule],
  controllers: [SchedulesController, AdminSchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
