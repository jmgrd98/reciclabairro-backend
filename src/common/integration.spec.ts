import { isSuspiciousReuse } from '../modules/auth/auth.service.js';
import { isCronAuthorized } from '../modules/notifications/cron.controller.js';
import { RateLimitStore } from './rate-limit.js';
import {
  BFF_SECRET_HEADER,
  CLIENT_IP_HEADER,
  resolveTracker,
} from './throttler.guard.js';

describe('limite de requisições atrás do BFF', () => {
  const secret = 'segredo-compartilhado-123';
  const headers = (extra: Record<string, string>) => ({ ...extra });

  it('com o segredo correto, conta pelo IP do usuário final', () => {
    expect(
      resolveTracker(
        headers({
          [BFF_SECRET_HEADER]: secret,
          [CLIENT_IP_HEADER]: '203.0.113.7',
        }),
        '10.0.0.1',
        secret,
      ),
    ).toBe('203.0.113.7');
  });

  it('sem segredo ou com segredo errado, ignora o IP informado', () => {
    expect(
      resolveTracker(
        headers({ [CLIENT_IP_HEADER]: '203.0.113.7' }),
        '10.0.0.1',
        secret,
      ),
    ).toBe('10.0.0.1');
    expect(
      resolveTracker(
        headers({
          [BFF_SECRET_HEADER]: 'errado',
          [CLIENT_IP_HEADER]: '203.0.113.7',
        }),
        '10.0.0.1',
        secret,
      ),
    ).toBe('10.0.0.1');
  });

  it('se a API não tem segredo configurado, nunca confia no cabeçalho', () => {
    expect(
      resolveTracker(
        headers({ [BFF_SECRET_HEADER]: '', [CLIENT_IP_HEADER]: '203.0.113.7' }),
        '10.0.0.1',
        undefined,
      ),
    ).toBe('10.0.0.1');
  });

  it('IP ausente ou absurdo cai no IP da conexão', () => {
    expect(
      resolveTracker(
        headers({ [BFF_SECRET_HEADER]: secret }),
        '10.0.0.1',
        secret,
      ),
    ).toBe('10.0.0.1');
    expect(
      resolveTracker(
        headers({
          [BFF_SECRET_HEADER]: secret,
          [CLIENT_IP_HEADER]: 'x'.repeat(200),
        }),
        '10.0.0.1',
        secret,
      ),
    ).toBe('10.0.0.1');
  });
});

describe('reuso de refresh token', () => {
  const revokedAt = new Date('2026-11-18T12:00:00Z');
  const after = (seconds: number) =>
    new Date(revokedAt.getTime() + seconds * 1000);

  it('dentro da tolerância é só uma corrida entre requisições', () => {
    expect(isSuspiciousReuse(revokedAt, after(5), 30)).toBe(false);
    expect(isSuspiciousReuse(revokedAt, after(30), 30)).toBe(false);
  });

  it('depois da tolerância é tratado como roubo', () => {
    expect(isSuspiciousReuse(revokedAt, after(31), 30)).toBe(true);
  });

  it('com tolerância zero, qualquer reuso é suspeito', () => {
    expect(isSuspiciousReuse(revokedAt, after(1), 0)).toBe(true);
  });
});

describe('rotina agendada (cron)', () => {
  const secret = 'segredo-do-cron-1234567';

  it('aceita só o Bearer com o segredo exato', () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronAuthorized(secret, secret)).toBe(false);
    expect(isCronAuthorized(undefined, secret)).toBe(false);
  });

  it('sem segredo configurado, ninguém entra', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer qualquer', '')).toBe(false);
  });
});

describe('limite de requisições (janela fixa)', () => {
  it('libera até o limite e bloqueia a seguinte, informando a espera', () => {
    let now = 0;
    const store = new RateLimitStore(() => now);
    const options = { limit: 3, ttl: 60_000 };
    expect([1, 2, 3].map(() => store.hit('ip|rota', options).allowed)).toEqual([
      true,
      true,
      true,
    ]);
    now = 20_000;
    expect(store.hit('ip|rota', options)).toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
  });

  it('a janela recomeça depois do prazo, e cada chave conta à parte', () => {
    let now = 0;
    const store = new RateLimitStore(() => now);
    const options = { limit: 1, ttl: 1_000 };
    expect(store.hit('a', options).allowed).toBe(true);
    expect(store.hit('a', options).allowed).toBe(false);
    expect(store.hit('b', options).allowed).toBe(true);
    now = 1_000;
    expect(store.hit('a', options).allowed).toBe(true);
  });

  it('janelas vencidas são descartadas', () => {
    let now = 0;
    const store = new RateLimitStore(() => now);
    for (let i = 0; i < 50; i += 1)
      store.hit(`ip-${i}`, { limit: 5, ttl: 1_000 });
    expect(store.size).toBe(50);
    now = 120_000;
    store.hit('novo', { limit: 5, ttl: 1_000 });
    expect(store.size).toBe(1);
  });
});
