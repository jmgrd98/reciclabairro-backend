import { Module } from '@nestjs/common';
import { CooperativesModule } from '../cooperatives/cooperatives.module.js';
import {
  CollectorPickupsController,
  CooperativePickupRequestsController,
  PickupRequestsController,
} from './pickup-requests.controller.js';
import { PickupRequestsService } from './pickup-requests.service.js';

@Module({
  imports: [CooperativesModule],
  controllers: [
    PickupRequestsController,
    CooperativePickupRequestsController,
    CollectorPickupsController,
  ],
  providers: [PickupRequestsService],
  exports: [PickupRequestsService],
})
export class PickupRequestsModule {}
