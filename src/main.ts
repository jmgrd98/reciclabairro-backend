import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('ReciclaBairro API')
    .setDescription(
      'Backend do ReciclaBairro: guia de materiais, pontos de entrega, calendário de coleta, solicitações de retirada, notificações e indicadores.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, swagger),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `API em http://localhost:${port}/api/v1 — documentação em http://localhost:${port}/docs`,
  );
}
await bootstrap();
