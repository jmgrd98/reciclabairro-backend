import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwagger } from './swagger.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Promise<Handler> | null = null;

async function create(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

/**
 * Entrada da função serverless (Vercel). A aplicação Nest é criada uma vez por
 * instância e reaproveitada entre requisições; se a criação falhar, a próxima
 * requisição tenta de novo em vez de ficar presa no erro.
 */
export function getHandler(): Promise<Handler> {
  handler ??= create().catch((error: unknown) => {
    handler = null;
    throw error;
  });
  return handler;
}
