import { Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

const logger = new Logger('Background');

/**
 * Executa um trabalho depois de a resposta ser enviada, sem atrasá-la.
 * Na Vercel usa `waitUntil`, que mantém a função viva até o trabalho acabar
 * (fora dela, a função seria congelada logo após responder). Em servidor
 * comum, o processo continua vivo e o trabalho só roda em paralelo.
 */
export function runAfterResponse(label: string, work: Promise<unknown>): void {
  const guarded = work.catch((error: unknown) => {
    logger.error(`${label}: ${String(error)}`);
  });
  if (process.env.VERCEL) {
    waitUntil(guarded);
  }
}
