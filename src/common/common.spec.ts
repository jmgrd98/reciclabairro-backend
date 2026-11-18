import type { Region } from '../generated/prisma/client.js';
import { isOpenAt } from '../modules/collection-points/collection-points.service.js';
import { buildPickupNotifications } from '../modules/notifications/pickup-messages.js';
import { distanceKm, matchRegion } from '../modules/regions/regions.service.js';
import {
  addDays,
  formatDateBr,
  startOfDayIn,
  todayIn,
  weekdayAndTimeIn,
} from './dates.js';
import { normalizeText, slugify } from './text.js';

describe('datas no fuso da aplicação', () => {
  const SP = 'America/Sao_Paulo';

  it('01:00 UTC ainda é o dia anterior em São Paulo (UTC-3)', () => {
    const instant = new Date('2026-11-18T01:00:00Z');
    expect(todayIn(SP, instant)).toBe('2026-11-17');
    expect(todayIn('UTC', instant)).toBe('2026-11-18');
  });

  it('dia da semana e hora locais', () => {
    // 18/11/2026 é uma quarta-feira; 15:30 UTC = 12:30 em São Paulo.
    expect(weekdayAndTimeIn(SP, new Date('2026-11-18T15:30:00Z'))).toEqual({
      weekday: 3,
      time: '12:30',
    });
  });

  it('início do dia local convertido para instante', () => {
    expect(startOfDayIn('2026-11-18', SP).toISOString()).toBe(
      '2026-11-18T03:00:00.000Z',
    );
    expect(startOfDayIn('2026-11-18', 'UTC').toISOString()).toBe(
      '2026-11-18T00:00:00.000Z',
    );
  });

  it('soma de dias atravessa mês e ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formato brasileiro', () => {
    expect(formatDateBr('2026-11-18')).toBe('18/11/2026');
  });
});

describe('texto', () => {
  it('normaliza acentos, caixa e espaços', () => {
    expect(normalizeText('  Papelão   ONDULADO ')).toBe('papelao ondulado');
    expect(slugify('Papel e papelão')).toBe('papel-e-papelao');
  });
});

describe('associação de endereço à região', () => {
  const region = (overrides: Partial<Region>): Region => ({
    id: 'r1',
    name: 'Vila Mariana',
    city: 'São Paulo',
    state: 'SP',
    neighborhoods: ['Vila Mariana', 'Paraíso'],
    centerLatitude: -23.5891,
    centerLongitude: -46.6345,
    radiusKm: 3,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it('casa pelo bairro ignorando acentos e maiúsculas', () => {
    const found = matchRegion([region({})], {
      neighborhood: 'PARAISO',
      city: 'sao paulo',
    });
    expect(found?.id).toBe('r1');
  });

  it('mesmo bairro em outra cidade não casa pelo nome', () => {
    expect(
      matchRegion([region({ centerLatitude: null })], {
        neighborhood: 'Paraíso',
        city: 'Campinas',
      }),
    ).toBeNull();
  });

  it('sem bairro conhecido, casa pela distância ao centro', () => {
    const found = matchRegion([region({})], {
      neighborhood: 'Bairro Desconhecido',
      latitude: -23.59,
      longitude: -46.64,
    });
    expect(found?.id).toBe('r1');
  });

  it('fora do raio não casa', () => {
    expect(
      matchRegion([region({})], { latitude: -23.4, longitude: -46.3 }),
    ).toBeNull();
  });

  it('com duas regiões no alcance, escolhe a de centro mais próximo', () => {
    const far = region({ id: 'longe', centerLatitude: -23.61, radiusKm: 10 });
    const near = region({ id: 'perto', radiusKm: 10 });
    const found = matchRegion([far, near], {
      latitude: -23.589,
      longitude: -46.634,
    });
    expect(found?.id).toBe('perto');
  });

  it('distância entre dois pontos conhecidos (~1,11 km por 0,01° de latitude)', () => {
    const km = distanceKm(
      { latitude: -23.58, longitude: -46.63 },
      { latitude: -23.59, longitude: -46.63 },
    );
    expect(km).toBeGreaterThan(1.1);
    expect(km).toBeLessThan(1.12);
  });
});

describe('horário de funcionamento', () => {
  const hours = [{ weekday: 3, opensAt: '08:00', closesAt: '17:00' }];

  it('aberto dentro do horário, fechado fora e em outro dia', () => {
    expect(isOpenAt(hours, 3, '08:00')).toBe(true);
    expect(isOpenAt(hours, 3, '16:59')).toBe(true);
    expect(isOpenAt(hours, 3, '17:00')).toBe(false);
    expect(isOpenAt(hours, 3, '07:59')).toBe(false);
    expect(isOpenAt(hours, 4, '10:00')).toBe(false);
  });
});

describe('mensagens de notificação', () => {
  const context = {
    id: 'p1',
    protocol: 'RB-2026-000001',
    requesterId: 'morador',
    collectorId: 'coletor',
    cooperativeName: 'Cooperativa Recicla Vila',
    scheduledDate: '2026-11-20',
    scheduledPeriod: 'MANHA' as const,
    managerIds: ['gestora'],
  };
  const event = (
    kind: Parameters<typeof buildPickupNotifications>[0]['kind'],
  ) => ({
    requestId: 'p1',
    kind,
    from: null,
    to: 'AGENDADA' as const,
    authorId: 'gestora',
    comment: 'Caminhão em manutenção',
  });

  it('agendamento avisa o solicitante (com e-mail) e o coletor', () => {
    const messages = buildPickupNotifications(event('SCHEDULED'), context);
    const requester = messages.find((m) => m.userIds.includes('morador'));
    expect(requester?.email).toBe(true);
    expect(requester?.body).toContain('20/11/2026, pela manhã');
    expect(messages.some((m) => m.userIds.includes('coletor'))).toBe(true);
  });

  it('quem fez a ação não recebe aviso da própria ação', () => {
    const messages = buildPickupNotifications(event('COMPLETED'), context);
    expect(messages.flatMap((m) => m.userIds)).not.toContain('gestora');
  });

  it('recusa leva o motivo e aponta a alternativa (pontos de entrega)', () => {
    const [message] = buildPickupNotifications(event('REFUSED'), context);
    expect(message.body).toContain('Motivo: Caminhão em manutenção');
    expect(message.body).toContain('ponto de entrega');
  });

  it('cancelamento pelo solicitante avisa só a equipe', () => {
    const messages = buildPickupNotifications(
      { ...event('CANCELLED_BY_REQUESTER'), authorId: 'morador' },
      context,
    );
    const recipients = messages.flatMap((m) => m.userIds);
    expect(recipients).toEqual(expect.arrayContaining(['gestora', 'coletor']));
    expect(recipients).not.toContain('morador');
  });
});
