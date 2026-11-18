import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Erro de regra de negócio com um código estável (para o frontend tratar)
 * e uma mensagem em português simples (para exibir ao usuário).
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unauthorized(code: string, message: string) {
    return new AppException(HttpStatus.UNAUTHORIZED, code, message);
  }

  static forbidden(
    code = 'FORBIDDEN',
    message = 'Você não tem permissão para realizar esta ação.',
  ) {
    return new AppException(HttpStatus.FORBIDDEN, code, message);
  }

  static notFound(code: string, message: string) {
    return new AppException(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(code: string, message: string) {
    return new AppException(HttpStatus.CONFLICT, code, message);
  }

  static unprocessable(code: string, message: string) {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
  }
}
