import { Module } from '@nestjs/common';
import { RegionsModule } from '../regions/regions.module.js';
import { CepService } from './cep.service.js';
import { CepController, MeController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [RegionsModule],
  controllers: [MeController, CepController],
  providers: [UsersService, CepService],
})
export class UsersModule {}
