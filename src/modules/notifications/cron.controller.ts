import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppException } from '../../common/app.exception.js';
import { Public } from '../../common/auth.js';
import { SkipRateLimit } from '../../common/rate-limit.js';
import { NotificationsService } from './notifications.service.js';

/** Confere o "Authorization: Bearer <CRON_SECRET>" sem vazar tempo de comparação. */
export function isCronAuthorized(
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(header);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

/**
 * Rotinas chamadas pelo agendador da hospedagem (Vercel Cron). Ficam fora da
 * documentação pública e só aceitam chamadas com o CRON_SECRET.
 */
@ApiExcludeController()
@Public()
@SkipRateLimit()
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Reenvia avisos que ficaram na fila (falha passageira do provedor de e-mail etc.). */
  @Get('dispatch-notifications')
  @HttpCode(200)
  async dispatch(@Headers('authorization') authorization?: string) {
    if (
      !isCronAuthorized(authorization, this.config.get<string>('CRON_SECRET'))
    ) {
      throw AppException.unauthorized(
        'UNAUTHORIZED',
        'Chamada não autorizada.',
      );
    }
    let sent = 0;
    // Esvazia a fila em lotes, até não sobrar nada enviável.
    for (let round = 0; round < 20; round += 1) {
      const batch = await this.notifications.dispatchPending(50);
      sent += batch;
      if (batch < 50) break;
    }
    return { ok: true, sent };
  }
}
