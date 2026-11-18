import { Module } from '@nestjs/common';
import { CooperativesModule } from '../cooperatives/cooperatives.module.js';
import { RegionsModule } from '../regions/regions.module.js';
import {
  CollectionPointsController,
  ManageCollectionPointsController,
} from './collection-points.controller.js';
import { CollectionPointsService } from './collection-points.service.js';

@Module({
  imports: [RegionsModule, CooperativesModule],
  // A ordem importa: "manage" precisa ser registrada antes de ":id".
  controllers: [ManageCollectionPointsController, CollectionPointsController],
  providers: [CollectionPointsService],
})
export class CollectionPointsModule {}
