import { Module } from '@nestjs/common';
import {
  AdminCooperativesController,
  CooperativeMembersController,
} from './cooperatives.controller.js';
import { CooperativesService } from './cooperatives.service.js';

@Module({
  controllers: [AdminCooperativesController, CooperativeMembersController],
  providers: [CooperativesService],
  exports: [CooperativesService],
})
export class CooperativesModule {}
