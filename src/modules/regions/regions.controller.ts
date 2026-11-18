import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../../common/auth.js';
import { Role } from '../../generated/prisma/client.js';
import { CreateRegionDto, UpdateRegionDto } from './regions.dto.js';
import { RegionsService } from './regions.service.js';

@ApiTags('Regiões e calendário')
@Public()
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as regiões atendidas' })
  list() {
    return this.regions.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.regions.get(id);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/regions')
export class AdminRegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  list() {
    return this.regions.list(true);
  }

  @Post()
  create(@Body() dto: CreateRegionDto) {
    return this.regions.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRegionDto) {
    return this.regions.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desativa a região' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.regions.deactivate(id);
  }
}
