import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

const DEFAULT_MESSAGES: Record<number, string> = {
  401: 'Faça login para continuar.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'Não encontramos o que você procura.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
};

/** Padroniza toda resposta de erro como { statusCode, code, message, details? }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null) {
        const data = payload as Record<string, unknown>;
        if (typeof data.code === 'string') {
          return {
            statusCode: status,
            code: data.code,
            message: String(data.message),
            ...(data.details !== undefined ? { details: data.details } : {}),
          };
        }
      }
      return {
        statusCode: status,
        code: DEFAULT_CODES[status] ?? 'ERROR',
        message: DEFAULT_MESSAGES[status] ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'ALREADY_EXISTS',
          message: 'Já existe um registro com esses dados.',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Não encontramos o que você procura.',
        };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'IN_USE',
          message:
            'Este registro está em uso ou faz referência a algo que não existe.',
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Algo deu errado do nosso lado. Tente novamente em instantes.',
    };
  }
}
