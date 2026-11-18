import { Module } from '@nestjs/common';
import {
  AdminMaterialsController,
  MaterialsController,
} from './materials.controller.js';
import { MaterialsService } from './materials.service.js';

@Module({
  controllers: [MaterialsController, AdminMaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
