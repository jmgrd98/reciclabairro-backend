import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../common/app.exception.js';
import type { AuthUser } from '../../common/auth.js';
import {
  addDays,
  dateOnlyToDate,
  dateToDateOnly,
  startOfDayIn,
  todayIn,
} from '../../common/dates.js';
import {
  PICKUP_EVENT,
  type PickupEvent,
  type PickupEventKind,
} from '../../common/events.js';
import { skipTake, toPage } from '../../common/pagination.js';
import {
  MemberRole,
  PickupStatus,
  Prisma,
  Role,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CooperativesService } from '../cooperatives/cooperatives.service.js';
import type {
  CompletePickupDto,
  CooperativeQueueQuery,
  CreatePickupRequestDto,
  MyPickupRequestsQuery,
  PickupItemDto,
  SchedulePickupDto,
} from './pickup-requests.dto.js';
import {
  assertTransition,
  isLate,
  OPEN_STATUSES,
  type PickupActor,
} from './pickup-state-machine.js';

const CATEGORY_SELECT = {
  select: { id: true, name: true, slug: true, color: true },
} as const;

const LIST_INCLUDE = {
  items: { include: { category: CATEGORY_SELECT } },
  region: { select: { id: true, name: true } },
  cooperative: { select: { id: true, name: true, phone: true } },
  collector: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.PickupRequestInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  collectedItems: { include: { category: CATEGORY_SELECT } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.PickupRequestInclude;

const REQUESTER_SELECT = {
  select: { id: true, name: true, phone: true, email: true },
} as const;

interface DateFields {
  status: PickupStatus;
  createdAt: Date;
  preferredDate: Date | null;
  scheduledDate: Date | null;
}

/** Condição SQL (Prisma) equivalente a isLate(), para filtros e contagens. */
export function lateWhere(
  now: Date,
  today: string,
  lateTriageHours: number,
): Prisma.PickupRequestWhereInput {
  return {
    OR: [
      {
        status: { in: [PickupStatus.SOLICITADA, PickupStatus.EM_ANALISE] },
        createdAt: {
          lt: new Date(now.getTime() - lateTriageHours * 3_600_000),
        },
      },
      {
        status: { in: [PickupStatus.AGENDADA, PickupStatus.EM_ROTA] },
        scheduledDate: { lt: dateOnlyToDate(today) },
      },
    ],
  };
}

export function formatAddress(address: {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}): string {
  const complement = address.complement ? ` - ${address.complement}` : '';
  return `${address.street}, ${address.number}${complement} - ${address.neighborhood}, ${address.city}/${address.state}, CEP ${address.zipCode}`;
}

@Injectable()
export class PickupRequestsService {
  private readonly logger = new Logger(PickupRequestsService.name);
  private readonly timeZone: string;
  private readonly lateTriageHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cooperatives: CooperativesService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<string>('APP_TIMEZONE');
    this.lateTriageHours = config.getOrThrow<number>('LATE_TRIAGE_HOURS');
  }

  // ═════════════ Solicitante (morador / comerciante) ═════════════

  async create(user: AuthUser, dto: CreatePickupRequestDto) {
    const address = await this.prisma.address.findUnique({
      where: { id: dto.addressId },
      include: { region: true },
    });
    if (!address || address.userId !== user.id) {
      throw AppException.notFound(
        'ADDRESS_NOT_FOUND',
        'Endereço não encontrado. Cadastre o endereço da retirada antes de pedir.',
      );
    }
    const notServed = AppException.unprocessable(
      'REGION_NOT_SERVED',
      'Ainda não fazemos retiradas neste endereço. Veja no mapa os pontos de entrega mais próximos.',
    );
    if (!address.region || !address.region.active) throw notServed;
    const cooperatives = await this.prisma.cooperativeRegion.count({
      where: { regionId: address.region.id, cooperative: { active: true } },
    });
    if (cooperatives === 0) throw notServed;

    if (dto.preferredDate && dto.preferredDate < this.today()) {
      throw AppException.unprocessable(
        'INVALID_DATE',
        'Escolha uma data a partir de hoje.',
      );
    }
    await this.assertCategories(dto.items);

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.pickupRequest.create({
        data: {
          requesterId: user.id,
          addressId: address.id,
          addressText: formatAddress(address),
          latitude: address.latitude,
          longitude: address.longitude,
          regionId: address.region!.id,
          preferredDate: dto.preferredDate
            ? dateOnlyToDate(dto.preferredDate)
            : null,
          preferredPeriod: dto.preferredPeriod ?? null,
          requesterNotes: dto.notes ?? null,
          items: { create: dto.items },
        },
      });
      const year = todayIn(this.timeZone, request.createdAt).slice(0, 4);
      const protocol = `RB-${year}-${String(request.sequence).padStart(6, '0')}`;
      await tx.pickupRequest.update({
        where: { id: request.id },
        data: { protocol },
      });
      await tx.pickupStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: PickupStatus.SOLICITADA,
          kind: 'CREATED',
          authorId: user.id,
        },
      });
      return request;
    });

    await this.emit({
      requestId: created.id,
      kind: 'CREATED',
      from: null,
      to: PickupStatus.SOLICITADA,
      authorId: user.id,
    });
    return this.detail(created.id, false);
  }

  /** Painel/histórico do solicitante. */
  async listMine(user: AuthUser, query: MyPickupRequestsQuery) {
    const where: Prisma.PickupRequestWhereInput = {
      requesterId: user.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.open === true ? { status: { in: OPEN_STATUSES } } : {}),
      ...(query.open === false ? { status: { notIn: OPEN_STATUSES } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.pickupRequest.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query),
      }),
      this.prisma.pickupRequest.count({ where }),
    ]);
    return toPage(
      items.map((item) => this.present(item)),
      total,
      query,
    );
  }

  async getMine(user: AuthUser, id: string) {
    await this.loadOwn(user, id);
    return this.detail(id, false);
  }

  async cancelByRequester(user: AuthUser, id: string, reason?: string) {
    const request = await this.loadOwn(user, id);
    await this.applyTransition({
      request,
      to: PickupStatus.CANCELADA,
      kind: 'CANCELLED_BY_REQUESTER',
      actor: 'REQUESTER',
      authorId: user.id,
      comment: reason ?? null,
      data: { closingReason: reason ?? null, closedAt: new Date() },
    });
    return this.detail(id, false);
  }

  // ═════════════ Cooperativa (gestor) ═════════════

  /** Fila do painel da cooperativa: pedidos dela + pedidos novos das regiões que atende. */
  async listQueue(user: AuthUser, query: CooperativeQueueQuery) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    const regionIds = await this.cooperatives.regionIdsOf(cooperativeId);
    const now = new Date();

    const filters: Prisma.PickupRequestWhereInput[] = [
      this.cooperativeScope(cooperativeId, regionIds),
    ];
    if (query.status) filters.push({ status: query.status });
    if (query.regionId) filters.push({ regionId: query.regionId });
    if (query.collectorId) filters.push({ collectorId: query.collectorId });
    if (query.materialCategoryId) {
      filters.push({
        items: { some: { categoryId: query.materialCategoryId } },
      });
    }
    if (query.from) {
      filters.push({
        createdAt: { gte: startOfDayIn(query.from, this.timeZone) },
      });
    }
    if (query.to) {
      filters.push({
        createdAt: { lt: startOfDayIn(addDays(query.to, 1), this.timeZone) },
      });
    }
    if (query.scheduledDate) {
      filters.push({ scheduledDate: dateOnlyToDate(query.scheduledDate) });
    }
    if (query.protocol) {
      filters.push({
        protocol: { contains: query.protocol.trim(), mode: 'insensitive' },
      });
    }
    if (query.late) {
      filters.push(lateWhere(now, this.today(), this.lateTriageHours));
    }
    const where: Prisma.PickupRequestWhereInput = { AND: filters };

    // Fila de trabalho: os mais antigos primeiro. Consulta geral: os mais recentes.
    const oldestFirst =
      query.late === true ||
      (query.status !== undefined && OPEN_STATUSES.includes(query.status));

    const [items, total] = await Promise.all([
      this.prisma.pickupRequest.findMany({
        where,
        include: { ...LIST_INCLUDE, requester: REQUESTER_SELECT },
        orderBy: { createdAt: oldestFirst ? 'asc' : 'desc' },
        ...skipTake(query),
      }),
      this.prisma.pickupRequest.count({ where }),
    ]);
    return toPage(
      items.map((item) => this.present(item, now)),
      total,
      query,
    );
  }

  async getForCooperative(user: AuthUser, id: string) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    await this.loadForCooperative(id, cooperativeId);
    return this.detail(id, true);
  }

  /** Gestor assume o pedido para a cooperativa (SOLICITADA → EM_ANALISE). */
  async startReview(user: AuthUser, id: string) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    const request = await this.loadForCooperative(id, cooperativeId);
    await this.applyTransition({
      request,
      to: PickupStatus.EM_ANALISE,
      kind: 'REVIEW_STARTED',
      actor: 'MANAGER',
      authorId: user.id,
      data: { cooperativeId, reviewStartedAt: new Date() },
      // Garante que duas cooperativas não assumam o mesmo pedido.
      extraWhere: { cooperativeId: null },
    });
    return this.detail(id, true);
  }

  /** Confirma a coleta definindo a data, ou reagenda ("ajuste"). */
  async schedule(user: AuthUser, id: string, dto: SchedulePickupDto) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    const request = await this.loadForCooperative(id, cooperativeId);
    if (request.status === PickupStatus.EM_ROTA) {
      throw AppException.conflict(
        'INVALID_TRANSITION',
        'A coleta já está em rota. Registre a conclusão ou que não foi realizada.',
      );
    }
    const isReschedule = request.status === PickupStatus.AGENDADA;
    if (isReschedule && !dto.comment?.trim()) {
      throw AppException.badRequest(
        'COMMENT_REQUIRED',
        'Ao reagendar, explique o motivo para o solicitante.',
      );
    }
    if (dto.scheduledDate < this.today()) {
      throw AppException.unprocessable(
        'INVALID_DATE',
        'Escolha uma data a partir de hoje.',
      );
    }
    if (dto.collectorId) {
      await this.assertCollector(cooperativeId, dto.collectorId);
    }

    await this.applyTransition({
      request,
      to: PickupStatus.AGENDADA,
      kind: isReschedule ? 'RESCHEDULED' : 'SCHEDULED',
      actor: 'MANAGER',
      authorId: user.id,
      comment: dto.comment?.trim() || null,
      data: {
        scheduledDate: dateOnlyToDate(dto.scheduledDate),
        scheduledPeriod:
          dto.scheduledPeriod ??
          request.scheduledPeriod ??
          request.preferredPeriod,
        confirmedAt: request.confirmedAt ?? new Date(),
        ...(dto.collectorId ? { collectorId: dto.collectorId } : {}),
      },
    });
    return this.detail(id, true);
  }

  /** Distribui a coleta agendada para um coletor. */
  async assign(user: AuthUser, id: string, collectorId: string) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    const request = await this.loadForCooperative(id, cooperativeId);
    if (request.status !== PickupStatus.AGENDADA) {
      throw AppException.conflict(
        'INVALID_TRANSITION',
        'Só é possível distribuir coletas que já estão agendadas.',
      );
    }
    const collector = await this.assertCollector(cooperativeId, collectorId);
    await this.applyTransition({
      request,
      to: PickupStatus.AGENDADA,
      kind: 'ASSIGNED',
      actor: 'MANAGER',
      authorId: user.id,
      comment: `Coletor responsável: ${collector.user.name}`,
      data: { collectorId },
    });
    return this.detail(id, true);
  }

  async refuse(user: AuthUser, id: string, reason: string) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    const request = await this.loadForCooperative(id, cooperativeId);
    await this.applyTransition({
      request,
      to: PickupStatus.RECUSADA,
      kind: 'REFUSED',
      actor: 'MANAGER',
      authorId: user.id,
      comment: reason,
      data: { closingReason: reason, closedAt: new Date() },
    });
    return this.detail(id, true);
  }

  async cancelByCooperative(user: AuthUser, id: string, reason: string) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    const request = await this.loadForCooperative(id, cooperativeId);
    await this.applyTransition({
      request,
      to: PickupStatus.CANCELADA,
      kind: 'CANCELLED_BY_COOPERATIVE',
      actor: 'MANAGER',
      authorId: user.id,
      comment: reason,
      data: { closingReason: reason, closedAt: new Date(), cooperativeId },
    });
    return this.detail(id, true);
  }

  // ═════════════ Coletor (e gestor, na execução) ═════════════

  /** Coletas do coletor no dia informado; sem data, as de hoje e as vencidas. */
  async listForCollector(user: AuthUser, date?: string) {
    await this.cooperatives.requireMembership(user.id, MemberRole.COLETOR);
    const today = this.today();
    const now = new Date();
    const items = await this.prisma.pickupRequest.findMany({
      where: {
        collectorId: user.id,
        status: { in: [PickupStatus.AGENDADA, PickupStatus.EM_ROTA] },
        scheduledDate: date
          ? dateOnlyToDate(date)
          : { lte: dateOnlyToDate(today) },
      },
      include: { ...LIST_INCLUDE, requester: REQUESTER_SELECT },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledPeriod: 'asc' }],
    });
    return items.map((item) => this.present(item, now));
  }

  async getForStaff(user: AuthUser, id: string) {
    await this.loadForExecution(user, id);
    return this.detail(id, true);
  }

  async startRoute(user: AuthUser, id: string) {
    const { request, actor } = await this.loadForExecution(user, id);
    assertTransition(request.status, PickupStatus.EM_ROTA, actor);
    const scheduled = request.scheduledDate
      ? dateToDateOnly(request.scheduledDate)
      : null;
    if (scheduled !== this.today()) {
      throw AppException.unprocessable(
        'NOT_SCHEDULED_FOR_TODAY',
        'Esta coleta não está agendada para hoje. Peça ao gestor para reagendar.',
      );
    }
    await this.applyTransition({
      request,
      to: PickupStatus.EM_ROTA,
      kind: 'ROUTE_STARTED',
      actor,
      authorId: user.id,
    });
    return this.detail(id, true);
  }

  /** Registra a conclusão, os materiais recolhidos e a observação do atendimento. */
  async complete(user: AuthUser, id: string, dto: CompletePickupDto) {
    const { request, actor } = await this.loadForExecution(user, id);
    assertTransition(request.status, PickupStatus.CONCLUIDA, actor);
    await this.assertCategories(dto.collectedItems);
    const now = new Date();
    await this.applyTransition({
      request,
      to: PickupStatus.CONCLUIDA,
      kind: 'COMPLETED',
      actor,
      authorId: user.id,
      comment: dto.notes?.trim() || null,
      data: {
        completedAt: now,
        closedAt: now,
        completionNotes: dto.notes?.trim() || null,
      },
      afterUpdate: async (tx) => {
        await tx.pickupCollectedItem.createMany({
          data: dto.collectedItems.map((item) => ({ ...item, requestId: id })),
        });
      },
    });
    return this.detail(id, true);
  }

  /** A coleta saiu em rota mas não pôde ser feita: volta para AGENDADA, com o motivo. */
  async notCollected(user: AuthUser, id: string, reason: string) {
    const { request, actor } = await this.loadForExecution(user, id);
    if (request.status !== PickupStatus.EM_ROTA) {
      throw AppException.conflict(
        'INVALID_TRANSITION',
        'Só é possível registrar "não realizada" em coletas que estão em rota.',
      );
    }
    await this.applyTransition({
      request,
      to: PickupStatus.AGENDADA,
      kind: 'NOT_COLLECTED',
      actor,
      authorId: user.id,
      comment: reason,
    });
    return this.detail(id, true);
  }

  // ═════════════ Internos ═════════════

  cooperativeScope(
    cooperativeId: string,
    regionIds: string[],
  ): Prisma.PickupRequestWhereInput {
    return {
      OR: [
        { cooperativeId },
        {
          cooperativeId: null,
          status: PickupStatus.SOLICITADA,
          regionId: { in: regionIds },
        },
      ],
    };
  }

  private today(): string {
    return todayIn(this.timeZone);
  }

  /**
   * Avisa os interessados (notificações) e espera eles terminarem, para que a
   * notificação já exista quando a resposta chegar ao aplicativo. Uma falha
   * aqui é só registrada: não desfaz a mudança de status, que já foi gravada.
   */
  private async emit(event: PickupEvent): Promise<void> {
    try {
      await this.events.emitAsync(PICKUP_EVENT, event);
    } catch (error) {
      this.logger.error(
        `Falha ao processar evento ${event.kind}: ${String(error)}`,
      );
    }
  }

  /**
   * Aplica uma mudança de status: valida na máquina de estados, atualiza com
   * trava otimista (o status precisa ser o mesmo que foi lido), grava o
   * histórico na mesma transação e, depois do commit, emite o evento.
   */
  private async applyTransition(params: {
    request: { id: string; status: PickupStatus };
    to: PickupStatus;
    kind: PickupEventKind;
    actor: PickupActor;
    authorId: string;
    comment?: string | null;
    data?: Prisma.PickupRequestUncheckedUpdateManyInput;
    extraWhere?: Prisma.PickupRequestWhereInput;
    afterUpdate?: (tx: Prisma.TransactionClient) => Promise<void>;
  }): Promise<void> {
    const { request, to, kind, actor, authorId } = params;
    assertTransition(request.status, to, actor);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pickupRequest.updateMany({
        where: { id: request.id, status: request.status, ...params.extraWhere },
        data: { ...params.data, status: to },
      });
      if (updated.count === 0) {
        throw AppException.conflict(
          'CONCURRENT_UPDATE',
          'Esta solicitação acabou de ser alterada por outra pessoa. Atualize a tela e tente de novo.',
        );
      }
      await tx.pickupStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: request.status,
          toStatus: to,
          kind,
          authorId,
          comment: params.comment ?? null,
        },
      });
      await params.afterUpdate?.(tx);
    });

    await this.emit({
      requestId: request.id,
      kind,
      from: request.status,
      to,
      authorId,
      comment: params.comment ?? null,
    });
  }

  private async loadOwn(user: AuthUser, id: string) {
    const request = await this.prisma.pickupRequest.findUnique({
      where: { id },
    });
    if (!request) throw this.notFound();
    if (request.requesterId !== user.id) {
      throw AppException.forbidden(
        'NOT_YOUR_REQUEST',
        'Esta solicitação pertence a outra pessoa.',
      );
    }
    return request;
  }

  private async loadForCooperative(id: string, cooperativeId: string) {
    const request = await this.prisma.pickupRequest.findUnique({
      where: { id },
    });
    if (!request) throw this.notFound();
    if (request.cooperativeId === cooperativeId) return request;

    const unclaimed =
      request.cooperativeId === null &&
      request.status === PickupStatus.SOLICITADA;
    if (unclaimed) {
      const regionIds = await this.cooperatives.regionIdsOf(cooperativeId);
      if (regionIds.includes(request.regionId)) return request;
    }
    throw AppException.forbidden(
      'NOT_YOUR_REQUEST',
      'Esta solicitação não pertence à sua cooperativa.',
    );
  }

  /** Quem executa a coleta: o coletor atribuído ou um gestor da mesma cooperativa. */
  private async loadForExecution(user: AuthUser, id: string) {
    const isCollector = user.role === Role.COLETOR;
    const membership = await this.cooperatives.requireMembership(
      user.id,
      isCollector ? MemberRole.COLETOR : MemberRole.GESTOR,
    );
    const request = await this.prisma.pickupRequest.findUnique({
      where: { id },
    });
    if (!request) throw this.notFound();
    if (request.cooperativeId !== membership.cooperativeId) {
      throw AppException.forbidden(
        'NOT_YOUR_REQUEST',
        'Esta solicitação não pertence à sua cooperativa.',
      );
    }
    if (isCollector && request.collectorId !== user.id) {
      throw AppException.forbidden(
        'NOT_ASSIGNED_TO_YOU',
        'Esta coleta está com outro coletor.',
      );
    }
    const actor: PickupActor = isCollector ? 'COLLECTOR' : 'MANAGER';
    return { request, actor };
  }

  private async assertCollector(cooperativeId: string, collectorId: string) {
    const member = await this.prisma.cooperativeMember.findUnique({
      where: { userId: collectorId },
      include: { user: { select: { name: true, active: true } } },
    });
    if (
      !member ||
      member.cooperativeId !== cooperativeId ||
      member.role !== MemberRole.COLETOR ||
      !member.active ||
      !member.user.active
    ) {
      throw AppException.unprocessable(
        'INVALID_COLLECTOR',
        'Escolha um coletor ativo da sua cooperativa.',
      );
    }
    return member;
  }

  private async assertCategories(items: PickupItemDto[]): Promise<void> {
    const ids = [...new Set(items.map((item) => item.categoryId))];
    const found = await this.prisma.materialCategory.count({
      where: { id: { in: ids } },
    });
    if (found !== ids.length) {
      throw AppException.badRequest(
        'INVALID_CATEGORY',
        'Algum tipo de material informado não existe.',
      );
    }
  }

  private notFound() {
    return AppException.notFound(
      'PICKUP_REQUEST_NOT_FOUND',
      'Solicitação não encontrada.',
    );
  }

  private async detail(id: string, forStaff: boolean) {
    const request = await this.prisma.pickupRequest.findUniqueOrThrow({
      where: { id },
      include: {
        ...DETAIL_INCLUDE,
        ...(forStaff ? { requester: REQUESTER_SELECT } : {}),
      },
    });
    return this.present(request);
  }

  /** Datas "só dia" como texto e o indicador calculado de atraso. */
  private present<T extends DateFields>(request: T, now: Date = new Date()) {
    const scheduledDate = request.scheduledDate
      ? dateToDateOnly(request.scheduledDate)
      : null;
    return {
      ...request,
      preferredDate: request.preferredDate
        ? dateToDateOnly(request.preferredDate)
        : null,
      scheduledDate,
      late: isLate(
        {
          status: request.status,
          createdAt: request.createdAt,
          scheduledDate,
        },
        now,
        this.today(),
        this.lateTriageHours,
      ),
    };
  }
}
