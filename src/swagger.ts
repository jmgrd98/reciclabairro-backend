import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Documentação interativa da API em /docs. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ReciclaBairro API')
    .setDescription(
      'Backend do ReciclaBairro: guia de materiais, pontos de entrega, calendário de coleta, solicitações de retirada, notificações e indicadores.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  // O build copia os arquivos da interface para dist/swagger-ui (ver
  // "postbuild"), porque na Vercel a pasta node_modules não vai inteira.
  const bundled = join(import.meta.dirname, 'swagger-ui');
  SwaggerModule.setup(
    'docs',
    app,
    () => SwaggerModule.createDocument(app, config),
    existsSync(bundled) ? { customSwaggerUiPath: bundled } : {},
  );
}
