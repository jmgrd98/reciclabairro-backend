import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../../common/auth.js';
import { Role } from '../../generated/prisma/client.js';
import {
  CreateScheduleDto,
  CreateScheduleExceptionDto,
  ScheduleLookupQuery,
  UpdateScheduleDto,
} from './schedules.dto.js';
import { SchedulesService } from './schedules.service.js';

@ApiTags('Regiões e calendário')
@Public()
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('regions/:id/schedule')
  @ApiOperation({ summary: 'Calendário de coleta seletiva da região' })
  forRegion(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.forRegion(id);
  }

  @Get('schedule')
  @ApiOperation({
    summary:
      'Calendário de coleta do local informado (bairro/cidade ou lat/lng)',
  })
  forLocation(@Query() query: ScheduleLookupQuery) {
    return this.schedules.forLocation(query);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminSchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post('schedules')
  create(@Body() dto: CreateScheduleDto) {
    return this.schedules.create(dto);
  }

  @Patch('schedules/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.update(id, dto);
  }

  @Delete('schedules/:id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.schedules.remove(id);
  }

  @Post('schedule-exceptions')
  @ApiOperation({ summary: 'Registra um dia sem coleta (feriado etc.)' })
  createException(@Body() dto: CreateScheduleExceptionDto) {
    return this.schedules.createException(dto);
  }

  @Delete('schedule-exceptions/:id')
  @HttpCode(204)
  async removeException(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.schedules.removeException(id);
  }
}
