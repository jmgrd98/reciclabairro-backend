import { Module } from '@nestjs/common';
import {
  AdminRegionsController,
  RegionsController,
} from './regions.controller.js';
import { RegionsService } from './regions.service.js';

@Module({
  controllers: [RegionsController, AdminRegionsController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}
