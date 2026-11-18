import { isSuspiciousReuse } from '../modules/auth/auth.service.js';
import { isCronAuthorized } from '../modules/notifications/cron.controller.js';
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
