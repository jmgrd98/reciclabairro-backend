import {
  type INestApplication,
  type ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AppException } from './common/app.exception.js';

/**
 * As mensagens padrão do class-validator são em inglês e começam pelo nome do
 * campo; trocamos essas por um texto simples em português. Mensagens escritas
 * por nós nos DTOs passam direto.
 */
function translate(field: string, key: string, message: string): string {
  if (key === 'whitelistValidation') return `O campo "${field}" não é aceito.`;
  const property = field.split('.').pop() ?? field;
  const isDefault =
    message.startsWith(`${property} `) || message.startsWith('each value in ');
  return isDefault ? `O campo "${field}" está inválido ou faltando.` : message;
}

function flattenErrors(
  errors: ValidationError[],
  parent = '',
): { field: string; messages: string[] }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [
          {
            field,
            messages: [
              ...new Set(
                Object.entries(error.constraints).map(([key, message]) =>
                  translate(field, key, message),
                ),
              ),
            ],
          },
        ]
      : [];
    return [...own, ...flattenErrors(error.children ?? [], field)];
  });
}

/** Configuração HTTP compartilhada entre a aplicação real e os testes e2e. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());

  const origins = config.getOrThrow<string>('CORS_ORIGINS');
  app.enableCors({
    origin:
      origins === '*' ? true : origins.split(',').map((item) => item.trim()),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const details = flattenErrors(errors);
        return AppException.badRequest(
          'VALIDATION_ERROR',
          details[0]?.messages[0] ??
            'Dados inválidos. Confira os campos e tente de novo.',
          details,
        );
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
