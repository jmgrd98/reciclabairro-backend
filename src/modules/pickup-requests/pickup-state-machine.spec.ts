import { AppException } from '../../common/app.exception.js';
import { PickupStatus } from '../../generated/prisma/client.js';
import {
  assertTransition,
  canTransition,
  isLate,
  type PickupActor,
} from './pickup-state-machine.js';

const S = PickupStatus;
const STATUSES = Object.values(PickupStatus);
const ACTORS: PickupActor[] = ['REQUESTER', 'MANAGER', 'COLLECTOR'];

/** Tabela de referência, escrita à mão a partir do plano: de → para → quem pode. */
const EXPECTED: [PickupStatus, PickupStatus, PickupActor[]][] = [
  [S.SOLICITADA, S.EM_ANALISE, ['MANAGER']],
  [S.SOLICITADA, S.CANCELADA, ['REQUESTER', 'MANAGER']],
  [S.EM_ANALISE, S.AGENDADA, ['MANAGER']],
  [S.EM_ANALISE, S.RECUSADA, ['MANAGER']],
  [S.EM_ANALISE, S.CANCELADA, ['REQUESTER', 'MANAGER']],
  [S.AGENDADA, S.AGENDADA, ['MANAGER']],
  [S.AGENDADA, S.EM_ROTA, ['MANAGER', 'COLLECTOR']],
  [S.AGENDADA, S.CANCELADA, ['REQUESTER', 'MANAGER']],
  [S.EM_ROTA, S.CONCLUIDA, ['MANAGER', 'COLLECTOR']],
  [S.EM_ROTA, S.AGENDADA, ['MANAGER', 'COLLECTOR']],
  [S.EM_ROTA, S.CANCELADA, ['MANAGER']],
];

function expectedActors(from: PickupStatus, to: PickupStatus): PickupActor[] {
  return EXPECTED.find(([f, t]) => f === from && t === to)?.[2] ?? [];
}

describe('máquina de estados da solicitação', () => {
  // Percorre TODAS as combinações de (de, para, ator): 7 × 7 × 3 = 147 casos.
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      for (const actor of ACTORS) {
        const allowed = expectedActors(from, to).includes(actor);
        it(`${from} → ${to} por ${actor}: ${allowed ? 'permitido' : 'negado'}`, () => {
          expect(canTransition(from, to, actor)).toBe(allowed);
        });
      }
    }
  }

  it('status finais não saem para lugar nenhum', () => {
    for (const final of [S.CONCLUIDA, S.CANCELADA, S.RECUSADA]) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransition(final, to, actor)).toBe(false);
        }
      }
    }
  });

  it('transição inexistente gera 409 INVALID_TRANSITION', () => {
    try {
      assertTransition(S.SOLICITADA, S.AGENDADA, 'MANAGER');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(409);
      expect((error as AppException).code).toBe('INVALID_TRANSITION');
    }
  });

  it('transição existente para outro ator gera 403', () => {
    try {
      assertTransition(S.EM_ROTA, S.CANCELADA, 'REQUESTER');
      expect.unreachable();
    } catch (error) {
      expect((error as AppException).getStatus()).toBe(403);
      expect((error as AppException).code).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('transição válida não lança erro', () => {
    expect(() =>
      assertTransition(S.AGENDADA, S.EM_ROTA, 'COLLECTOR'),
    ).not.toThrow();
  });
});

describe('cálculo de "atrasada"', () => {
  const now = new Date('2026-11-18T15:00:00Z');
  const today = '2026-11-18';
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * 3_600_000);

  it('sem triagem depois de 48 h está atrasada', () => {
    const base = { scheduledDate: null, createdAt: hoursAgo(49) };
    expect(isLate({ ...base, status: S.SOLICITADA }, now, today, 48)).toBe(
      true,
    );
    expect(isLate({ ...base, status: S.EM_ANALISE }, now, today, 48)).toBe(
      true,
    );
  });

  it('sem triagem dentro das 48 h não está atrasada', () => {
    expect(
      isLate(
        { status: S.SOLICITADA, scheduledDate: null, createdAt: hoursAgo(47) },
        now,
        today,
        48,
      ),
    ).toBe(false);
  });

  it('agendada para ontem e não concluída está atrasada', () => {
    const base = { createdAt: hoursAgo(200), scheduledDate: '2026-11-17' };
    expect(isLate({ ...base, status: S.AGENDADA }, now, today, 48)).toBe(true);
    expect(isLate({ ...base, status: S.EM_ROTA }, now, today, 48)).toBe(true);
  });

  it('agendada para hoje ou para o futuro não está atrasada', () => {
    const base = { createdAt: hoursAgo(200), status: S.AGENDADA };
    expect(isLate({ ...base, scheduledDate: today }, now, today, 48)).toBe(
      false,
    );
    expect(
      isLate({ ...base, scheduledDate: '2026-11-25' }, now, today, 48),
    ).toBe(false);
  });

  it('pedidos encerrados nunca estão atrasados', () => {
    for (const status of [S.CONCLUIDA, S.CANCELADA, S.RECUSADA]) {
      expect(
        isLate(
          { status, createdAt: hoursAgo(999), scheduledDate: '2026-01-01' },
          now,
          today,
          48,
        ),
      ).toBe(false);
    }
  });
});
