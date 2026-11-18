import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app.exception.js';
import { dateOnlyToDate, dateToDateOnly, todayIn } from '../../common/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RegionsService } from '../regions/regions.service.js';
import type {
  CreateScheduleDto,
  CreateScheduleExceptionDto,
  ScheduleLookupQuery,
  UpdateScheduleDto,
} from './schedules.dto.js';

@Injectable()
export class SchedulesService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly regions: RegionsService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<string>('APP_TIMEZONE');
  }

  /** Calendário semanal da região + próximas datas sem coleta. */
  async forRegion(regionId: string) {
    const region = await this.regions.get(regionId);
    const today = dateOnlyToDate(todayIn(this.timeZone));
    const [weekly, exceptions] = await Promise.all([
      this.prisma.collectionSchedule.findMany({
        where: { regionId },
        include: { categories: true },
        orderBy: [{ weekday: 'asc' }, { period: 'asc' }],
      }),
      this.prisma.scheduleException.findMany({
        where: { regionId, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 30,
      }),
    ]);
    return {
      region: { id: region.id, name: region.name, city: region.city },
      weekly,
      exceptions: exceptions.map((item) => ({
        id: item.id,
        date: dateToDateOnly(item.date),
        reason: item.reason,
      })),
    };
  }

  /** Calendário do local informado (bairro/cidade ou coordenadas). */
  async forLocation(query: ScheduleLookupQuery) {
    const region = await this.regions.resolve({
      neighborhood: query.neighborhood,
      city: query.city,
      latitude: query.lat,
      longitude: query.lng,
    });
    if (!region) {
      throw AppException.notFound(
        'REGION_NOT_SERVED',
        'Ainda não temos o calendário de coleta para este local.',
      );
    }
    return this.forRegion(region.id);
  }

  create(dto: CreateScheduleDto) {
    const { categoryIds, ...data } = dto;
    return this.prisma.collectionSchedule.create({
      data: {
        ...data,
        categories: { connect: categoryIds.map((id) => ({ id })) },
      },
      include: { categories: true },
    });
  }

  update(id: string, dto: UpdateScheduleDto) {
    const { categoryIds, ...data } = dto;
    return this.prisma.collectionSchedule.update({
      where: { id },
      data: {
        ...data,
        ...(categoryIds
          ? { categories: { set: categoryIds.map((item) => ({ id: item })) } }
          : {}),
      },
      include: { categories: true },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.collectionSchedule.delete({ where: { id } });
  }

  async createException(dto: CreateScheduleExceptionDto) {
    const created = await this.prisma.scheduleException.create({
      data: {
        regionId: dto.regionId,
        date: dateOnlyToDate(dto.date),
        reason: dto.reason,
      },
    });
    return { ...created, date: dateToDateOnly(created.date) };
  }

  async removeException(id: string): Promise<void> {
    await this.prisma.scheduleException.delete({ where: { id } });
  }
}
