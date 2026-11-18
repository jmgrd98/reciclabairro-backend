import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Envio de push pelo serviço da Expo (app mobile). Ligado por PUSH_ENABLED. */
@Injectable()
export class PushService {
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = config.getOrThrow<boolean>('PUSH_ENABLED');
  }

  async send(message: PushMessage): Promise<void> {
    if (!this.enabled || message.tokens.length === 0) return;
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(
        message.tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          sound: 'default',
        })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Expo push respondeu HTTP ${response.status}`);
    }
  }
}
