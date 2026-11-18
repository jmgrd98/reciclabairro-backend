import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwagger } from './swagger.js';

/** Servidor comum (desenvolvimento, Docker). Na Vercel, a entrada é src/serverless.ts. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  setupSwagger(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `API em http://localhost:${port}/api/v1 — documentação em http://localhost:${port}/docs`,
  );
}
await bootstrap();
