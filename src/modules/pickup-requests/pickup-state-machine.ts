import { AppException } from '../../common/app.exception.js';
import { PickupStatus } from '../../generated/prisma/client.js';

/** Quem está pedindo a mudança de status. */
export type PickupActor = 'REQUESTER' | 'MANAGER' | 'COLLECTOR';

const S = PickupStatus;

/**
 * Transições permitidas e quem pode fazê-las.
 *
 *   SOLICITADA → EM_ANALISE → AGENDADA → EM_ROTA → CONCLUIDA
 *
 * - RECUSADA só nasce da análise (EM_ANALISE).
 * - AGENDADA → AGENDADA é o reagendamento ("ajuste").
 * - EM_ROTA → AGENDADA registra uma coleta que não pôde ser realizada.
 * - O solicitante cancela até AGENDADA; depois disso, só a cooperativa.
 */
export const PICKUP_TRANSITIONS: Record<
  PickupStatus,
  Partial<Record<PickupStatus, PickupActor[]>>
> = {
  [S.SOLICITADA]: {
    [S.EM_ANALISE]: ['MANAGER'],
    [S.CANCELADA]: ['REQUESTER', 'MANAGER'],
  },
  [S.EM_ANALISE]: {
    [S.AGENDADA]: ['MANAGER'],
    [S.RECUSADA]: ['MANAGER'],
    [S.CANCELADA]: ['REQUESTER', 'MANAGER'],
  },
  [S.AGENDADA]: {
    [S.AGENDADA]: ['MANAGER'],
    [S.EM_ROTA]: ['MANAGER', 'COLLECTOR'],
    [S.CANCELADA]: ['REQUESTER', 'MANAGER'],
  },
  [S.EM_ROTA]: {
    [S.CONCLUIDA]: ['MANAGER', 'COLLECTOR'],
    [S.AGENDADA]: ['MANAGER', 'COLLECTOR'],
    [S.CANCELADA]: ['MANAGER'],
  },
  [S.CONCLUIDA]: {},
  [S.CANCELADA]: {},
  [S.RECUSADA]: {},
};

export const OPEN_STATUSES: PickupStatus[] = [
  S.SOLICITADA,
  S.EM_ANALISE,
  S.AGENDADA,
  S.EM_ROTA,
];

export const STATUS_LABELS: Record<PickupStatus, string> = {
  [S.SOLICITADA]: 'solicitada',
  [S.EM_ANALISE]: 'em análise',
  [S.AGENDADA]: 'agendada',
  [S.EM_ROTA]: 'em rota',
  [S.CONCLUIDA]: 'concluída',
  [S.CANCELADA]: 'cancelada',
  [S.RECUSADA]: 'recusada',
};

export function canTransition(
  from: PickupStatus,
  to: PickupStatus,
  actor: PickupActor,
): boolean {
  return PICKUP_TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** Lança 409 se a mudança não existe e 403 se existe mas não para esse ator. */
export function assertTransition(
  from: PickupStatus,
  to: PickupStatus,
  actor: PickupActor,
): void {
  const allowed = PICKUP_TRANSITIONS[from][to];
  if (!allowed) {
    throw AppException.conflict(
      'INVALID_TRANSITION',
      `Esta solicitação está ${STATUS_LABELS[from]} e não pode passar para ${STATUS_LABELS[to]}.`,
    );
  }
  if (!allowed.includes(actor)) {
    throw AppException.forbidden(
      'TRANSITION_NOT_ALLOWED',
      'Você não pode fazer esta alteração nesta etapa da solicitação.',
    );
  }
}

export interface LateCheckInput {
  status: PickupStatus;
  createdAt: Date;
  /** Data agendada, "YYYY-MM-DD". */
  scheduledDate: string | null;
}

/**
 * "Atrasada" não é um status, é calculado:
 * - ainda sem agendamento depois do prazo de triagem; ou
 * - com data agendada já vencida e sem conclusão.
 */
export function isLate(
  request: LateCheckInput,
  now: Date,
  today: string,
  lateTriageHours: number,
): boolean {
  if (request.status === S.SOLICITADA || request.status === S.EM_ANALISE) {
    return (
      now.getTime() - request.createdAt.getTime() > lateTriageHours * 3_600_000
    );
  }
  if (request.status === S.AGENDADA || request.status === S.EM_ROTA) {
    return request.scheduledDate !== null && request.scheduledDate < today;
  }
  return false;
}
