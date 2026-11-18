import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { resolveTracker } from './throttler.guard.js';

/**
 * Limite de requisições por cliente (substitui o @nestjs/throttler, que ainda é
 * CommonJS e não carrega com o NestJS 12 na Vercel).
 *
 * A contagem fica em memória: num servidor comum vale para todos; em hospedagem
 * serverless, cada instância conta à parte, então o limite real é mais folgado.
 * É uma proteção contra abuso simples, não uma cota exata.
 */
export interface RateLimitOptions {
  /** Requisições permitidas na janela. */
  limit: number;
  /** Tamanho da janela, em milissegundos. */
  ttl: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 120, ttl: 60_000 };

const RATE_LIMIT_KEY = 'rateLimit';
const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/** Limite próprio para a rota (ou o controller inteiro). */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/** Rota sem limite (health check, chamadas agendadas). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

interface Window {
  count: number;
  resetAt: number;
}

/** Janela fixa por chave. Separada do Nest para ser testada sem framework. */
export class RateLimitStore {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Conta uma requisição e diz se ela passa, e quantos segundos esperar se não. */
  hit(
    key: string,
    options: RateLimitOptions,
  ): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    this.sweep(now);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + options.ttl };
      this.windows.set(key, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= options.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  get size(): number {
    return this.windows.size;
  }

  /** Remove janelas vencidas de tempos em tempos, para a memória não crescer. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new RateLimitStore();
  private readonly disabled: boolean;
  private readonly secret: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    // Os testes e2e fazem muitos logins seguidos; o limite só vale fora deles.
    this.disabled = config.get<string>('NODE_ENV') === 'test';
    this.secret = config.get<string>('BFF_SHARED_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.disabled || context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)
    ) {
      return true;
    }
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(
        RATE_LIMIT_KEY,
        targets,
      ) ?? DEFAULT_RATE_LIMIT;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const tracker = resolveTracker(
      request.headers,
      request.ip ?? 'unknown',
      this.secret,
    );
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const { allowed, retryAfterSeconds } = this.store.hit(
      `${tracker}|${route}`,
      options,
    );
    if (!allowed) {
      http
        .getResponse<Response>()
        .setHeader('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
