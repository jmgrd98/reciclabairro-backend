import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/app.exception.js';
import type { AuthUser } from '../../common/auth.js';
import { weekdayAndTimeIn } from '../../common/dates.js';
import {
  type PaginationQuery,
  skipTake,
  toPage,
} from '../../common/pagination.js';
import { MemberRole, Prisma, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CooperativesService } from '../cooperatives/cooperatives.service.js';
import { RegionsService } from '../regions/regions.service.js';
import type {
  CollectionPointsQuery,
  CreateCollectionPointDto,
  UpdateCollectionPointDto,
} from './collection-points.dto.js';

const POINT_INCLUDE = {
  categories: { include: { category: true } },
  hours: { orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] },
  region: { select: { id: true, name: true } },
  cooperative: { select: { id: true, name: true } },
} satisfies Prisma.CollectionPointInclude;

type PointWithRelations = Prisma.CollectionPointGetPayload<{
  include: typeof POINT_INCLUDE;
}>;

export function isOpenAt(
  hours: { weekday: number; opensAt: string; closesAt: string }[],
  weekday: number,
  time: string,
): boolean {
  return hours.some(
    (slot) =>
      slot.weekday === weekday && slot.opensAt <= time && slot.closesAt > time,
  );
}

@Injectable()
export class CollectionPointsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly regions: RegionsService,
    private readonly cooperatives: CooperativesService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<string>('APP_TIMEZONE');
  }

  /** Busca pública: com lat/lng ordena por distância (PostGIS); sem, por nome. */
  async search(query: CollectionPointsQuery) {
    const hasLocation = query.lat !== undefined && query.lng !== undefined;
    if (query.radiusKm !== undefined && !hasLocation) {
      throw AppException.badRequest(
        'LOCATION_REQUIRED',
        'Para buscar por raio, informe a localização (lat e lng).',
      );
    }

    let categoryId = query.categoryId;
    if (!categoryId && query.materialId) {
      const material = await this.prisma.material.findUnique({
        where: { id: query.materialId },
        select: { categoryId: true },
      });
      if (!material) {
        throw AppException.notFound(
          'MATERIAL_NOT_FOUND',
          'Material não encontrado no guia.',
        );
      }
      categoryId = material.categoryId;
    }

    const now = weekdayAndTimeIn(this.timeZone);
    const point = hasLocation
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography`
      : null;

    const conditions: Prisma.Sql[] = [Prisma.sql`cp."active" = true`];
    if (point && query.radiusKm !== undefined) {
      conditions.push(
        Prisma.sql`ST_DWithin(cp."geo", ${point}, ${query.radiusKm * 1000})`,
      );
    }
    if (categoryId) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "CollectionPointCategory" c
        WHERE c."collectionPointId" = cp."id" AND c."categoryId" = ${categoryId}::uuid)`);
    }
    if (query.type) {
      conditions.push(
        Prisma.sql`cp."type" = ${query.type}::"CollectionPointType"`,
      );
    }
    if (query.openNow) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "CollectionPointHours" h
        WHERE h."collectionPointId" = cp."id" AND h."weekday" = ${now.weekday}
          AND h."opensAt" <= ${now.time} AND h."closesAt" > ${now.time})`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const distance = point
      ? Prisma.sql`ST_Distance(cp."geo", ${point})`
      : Prisma.sql`NULL::float8`;
    const order = point
      ? Prisma.sql`distance_m ASC, cp."name" ASC`
      : Prisma.sql`cp."name" ASC`;
    const { skip, take } = skipTake(query);

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; distance_m: number | null }[]>`
        SELECT cp."id", ${distance} AS distance_m
        FROM "CollectionPoint" cp
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM "CollectionPoint" cp WHERE ${where}`,
    ]);

    const points = await this.prisma.collectionPoint.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      include: POINT_INCLUDE,
    });
    const byId = new Map(points.map((item) => [item.id, item]));
    const items = rows.flatMap((row) => {
      const item = byId.get(row.id);
      return item ? [this.present(item, now, row.distance_m)] : [];
    });
    return toPage(items, totals[0]?.total ?? 0, query);
  }

  async get(id: string) {
    const point = await this.prisma.collectionPoint.findUnique({
      where: { id },
      include: POINT_INCLUDE,
    });
    if (!point || !point.active) {
      throw AppException.notFound(
        'COLLECTION_POINT_NOT_FOUND',
        'Ponto de coleta não encontrado.',
      );
    }
    return this.present(point, weekdayAndTimeIn(this.timeZone), null);
  }

  // ───────────── Cadastro (admin e gestor) ─────────────

  /** Lista para gestão: admin vê todos (inclusive inativos); gestor, os da própria cooperativa. */
  async listForManagement(user: AuthUser, query: PaginationQuery) {
    const where: Prisma.CollectionPointWhereInput =
      user.role === Role.ADMIN
        ? {}
        : {
            cooperativeId: (
              await this.cooperatives.requireMembership(
                user.id,
                MemberRole.GESTOR,
              )
            ).cooperativeId,
          };
    const [points, total] = await Promise.all([
      this.prisma.collectionPoint.findMany({
        where,
        include: POINT_INCLUDE,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.collectionPoint.count({ where }),
    ]);
    const now = weekdayAndTimeIn(this.timeZone);
    return toPage(
      points.map((point) => this.present(point, now, null)),
      total,
      query,
    );
  }

  async create(user: AuthUser, dto: CreateCollectionPointDto) {
    const cooperativeId = await this.resolveCooperativeId(
      user,
      dto.cooperativeId,
    );
    this.assertHours(dto.hours);
    const { categoryIds, hours, cooperativeId: _ignored, ...data } = dto;
    const region = await this.regions.resolve(data);

    const created = await this.prisma.collectionPoint.create({
      data: {
        ...data,
        state: data.state.toUpperCase(),
        regionId: region?.id ?? null,
        cooperativeId,
        categories: {
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
        hours: { create: hours },
      },
    });
    return this.getForManagement(created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateCollectionPointDto) {
    const current = await this.assertCanManage(user, id);
    if (dto.hours) this.assertHours(dto.hours);
    const { categoryIds, hours, cooperativeId, ...data } = dto;
    const region = await this.regions.resolve({ ...current, ...data });

    await this.prisma.$transaction(async (tx) => {
      await tx.collectionPoint.update({
        where: { id },
        data: {
          ...data,
          state: data.state?.toUpperCase(),
          regionId: region?.id ?? null,
          // Só o admin pode trocar a cooperativa responsável.
          ...(user.role === Role.ADMIN && cooperativeId !== undefined
            ? { cooperativeId }
            : {}),
        },
      });
      if (categoryIds) {
        await tx.collectionPointCategory.deleteMany({
          where: { collectionPointId: id },
        });
        await tx.collectionPointCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            collectionPointId: id,
            categoryId,
          })),
        });
      }
      if (hours) {
        await tx.collectionPointHours.deleteMany({
          where: { collectionPointId: id },
        });
        await tx.collectionPointHours.createMany({
          data: hours.map((slot) => ({ ...slot, collectionPointId: id })),
        });
      }
    });
    return this.getForManagement(id);
  }

  /** Pontos não são apagados: são desativados e somem da busca pública. */
  async deactivate(user: AuthUser, id: string) {
    await this.assertCanManage(user, id);
    await this.prisma.collectionPoint.update({
      where: { id },
      data: { active: false },
    });
  }

  private async getForManagement(id: string) {
    const point = await this.prisma.collectionPoint.findUniqueOrThrow({
      where: { id },
      include: POINT_INCLUDE,
    });
    return this.present(point, weekdayAndTimeIn(this.timeZone), null);
  }

  private async resolveCooperativeId(
    user: AuthUser,
    requested?: string,
  ): Promise<string | null> {
    if (user.role === Role.ADMIN) return requested ?? null;
    const membership = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    return membership.cooperativeId;
  }

  private async assertCanManage(user: AuthUser, id: string) {
    const point = await this.prisma.collectionPoint.findUnique({
      where: { id },
    });
    if (!point) {
      throw AppException.notFound(
        'COLLECTION_POINT_NOT_FOUND',
        'Ponto de coleta não encontrado.',
      );
    }
    if (user.role !== Role.ADMIN) {
      const membership = await this.cooperatives.requireMembership(
        user.id,
        MemberRole.GESTOR,
      );
      if (point.cooperativeId !== membership.cooperativeId) {
        throw AppException.forbidden(
          'NOT_YOUR_COLLECTION_POINT',
          'Este ponto de coleta pertence a outra organização.',
        );
      }
    }
    return point;
  }

  private assertHours(hours: { opensAt: string; closesAt: string }[]) {
    if (hours.some((slot) => slot.opensAt >= slot.closesAt)) {
      throw AppException.badRequest(
        'INVALID_HOURS',
        'O horário de abertura precisa ser antes do horário de fechamento.',
      );
    }
  }

  private present(
    point: PointWithRelations,
    now: { weekday: number; time: string },
    distanceMeters: number | null,
  ) {
    const { categories, hours, ...rest } = point;
    return {
      ...rest,
      categories: categories.map((item) => item.category),
      hours: hours.map(({ weekday, opensAt, closesAt }) => ({
        weekday,
        opensAt,
        closesAt,
      })),
      openNow: isOpenAt(hours, now.weekday, now.time),
      distanceKm:
        distanceMeters === null ? null : Math.round(distanceMeters / 10) / 100,
    };
  }
}
