import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDays, startOfDayIn, todayIn } from '../../common/dates.js';
import { PickupStatus, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { lateWhere } from '../pickup-requests/pickup-requests.service.js';
import { OPEN_STATUSES } from '../pickup-requests/pickup-state-machine.js';

export interface DashboardRange {
  /** "YYYY-MM-DD" */
  from?: string;
  to?: string;
}

function averageHours(pairs: [Date | null, Date | null][]): number | null {
  const durations = pairs
    .filter(
      (pair): pair is [Date, Date] => pair[0] !== null && pair[1] !== null,
    )
    .map(([start, end]) => (end.getTime() - start.getTime()) / 3_600_000);
  if (durations.length === 0) return null;
  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.round((total / durations.length) * 10) / 10;
}

/** Indicadores de acompanhamento descritos na seção 5.4 do projeto. */
@Injectable()
export class DashboardService {
  private readonly timeZone: string;
  private readonly lateTriageHours: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<string>('APP_TIMEZONE');
    this.lateTriageHours = config.getOrThrow<number>('LATE_TRIAGE_HOURS');
  }

  /**
   * @param scope    quais pedidos entram (os de uma cooperativa, uma região ou todos)
   * @param range    período pela data de criação do pedido
   * @param withGuide incluir o uso do guia de materiais (visão geral da plataforma)
   */
  async overview(
    scope: Prisma.PickupRequestWhereInput,
    range: DashboardRange,
    withGuide: boolean,
  ) {
    const createdAt: Prisma.DateTimeFilter = {
      ...(range.from ? { gte: startOfDayIn(range.from, this.timeZone) } : {}),
      ...(range.to
        ? { lt: startOfDayIn(addDays(range.to, 1), this.timeZone) }
        : {}),
    };
    const where: Prisma.PickupRequestWhereInput = {
      AND: [scope, { createdAt }],
    };
    const now = new Date();

    const [byStatusRows, lateNow, timings, byRegionRows, collectedRows] =
      await Promise.all([
        this.prisma.pickupRequest.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.pickupRequest.count({
          where: {
            AND: [
              scope,
              lateWhere(now, todayIn(this.timeZone), this.lateTriageHours),
            ],
          },
        }),
        this.prisma.pickupRequest.findMany({
          where: { AND: [where, { confirmedAt: { not: null } }] },
          select: { createdAt: true, confirmedAt: true, completedAt: true },
          take: 5000,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.pickupRequest.groupBy({
          by: ['regionId', 'status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.pickupCollectedItem.groupBy({
          by: ['categoryId', 'unit'],
          where: { request: where },
          _sum: { quantity: true },
        }),
      ]);

    const byStatus = Object.fromEntries(
      Object.values(PickupStatus).map((status) => [status, 0]),
    ) as Record<PickupStatus, number>;
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;

    const total = Object.values(byStatus).reduce(
      (sum, value) => sum + value,
      0,
    );
    const concluded = byStatus.CONCLUIDA;
    const cancelled = byStatus.CANCELADA;
    const refused = byStatus.RECUSADA;
    const open = OPEN_STATUSES.reduce(
      (sum, status) => sum + byStatus[status],
      0,
    );

    const [regions, categories] = await Promise.all([
      this.prisma.region.findMany({
        where: {
          id: { in: [...new Set(byRegionRows.map((row) => row.regionId))] },
        },
        select: { id: true, name: true },
      }),
      this.prisma.materialCategory.findMany({
        where: {
          id: { in: [...new Set(collectedRows.map((row) => row.categoryId))] },
        },
        select: { id: true, name: true },
      }),
    ]);

    const byRegion = regions
      .map((region) => {
        const rows = byRegionRows.filter((row) => row.regionId === region.id);
        const count = (statuses: PickupStatus[]) =>
          rows
            .filter((row) => statuses.includes(row.status))
            .reduce((sum, row) => sum + row._count._all, 0);
        return {
          regionId: region.id,
          regionName: region.name,
          total: count(Object.values(PickupStatus)),
          concluded: count([PickupStatus.CONCLUIDA]),
          open: count(OPEN_STATUSES),
        };
      })
      .sort((a, b) => b.total - a.total);

    const categoryNames = new Map(
      categories.map((item) => [item.id, item.name]),
    );
    const collectedMaterials = collectedRows
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: categoryNames.get(row.categoryId) ?? '—',
        unit: row.unit,
        quantity: row._sum.quantity ?? 0,
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

    return {
      period: { from: range.from ?? null, to: range.to ?? null },
      requests: {
        total,
        open,
        concluded,
        notConcluded: cancelled + refused,
        cancelled,
        refused,
        /** Atrasadas neste momento (independe do período). */
        lateNow,
        completionRate:
          total > 0 ? Math.round((concluded / total) * 1000) / 10 : null,
        byStatus,
      },
      /** Tempos médios, em horas. */
      averageHours: {
        requestToConfirmation: averageHours(
          timings.map((item) => [item.createdAt, item.confirmedAt]),
        ),
        confirmationToCompletion: averageHours(
          timings.map((item) => [item.confirmedAt, item.completedAt]),
        ),
        requestToCompletion: averageHours(
          timings.map((item) => [item.createdAt, item.completedAt]),
        ),
      },
      byRegion,
      collectedMaterials,
      ...(withGuide ? { materialGuide: await this.guideUsage(range) } : {}),
    };
  }

  private async guideUsage(range: DashboardRange) {
    const viewedAt: Prisma.DateTimeFilter = {
      ...(range.from ? { gte: startOfDayIn(range.from, this.timeZone) } : {}),
      ...(range.to
        ? { lt: startOfDayIn(addDays(range.to, 1), this.timeZone) }
        : {}),
    };
    const [views, top] = await Promise.all([
      this.prisma.materialGuideView.count({ where: { viewedAt } }),
      this.prisma.materialGuideView.groupBy({
        by: ['materialId'],
        where: { viewedAt },
        _count: { _all: true },
        orderBy: { _count: { materialId: 'desc' } },
        take: 5,
      }),
    ]);
    const materials = await this.prisma.material.findMany({
      where: { id: { in: top.map((row) => row.materialId) } },
      select: { id: true, name: true },
    });
    const names = new Map(materials.map((item) => [item.id, item.name]));
    return {
      views,
      topMaterials: top.map((row) => ({
        materialId: row.materialId,
        name: names.get(row.materialId) ?? '—',
        views: row._count._all,
      })),
    };
  }
}
