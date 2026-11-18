import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Role } from '../generated/prisma/client.js';

/** Usuário autenticado, extraído do token de acesso. */
export interface AuthUser {
  id: string;
  role: Role;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Rota acessível sem login. Se um token válido for enviado, o usuário ainda é identificado. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restringe a rota aos papéis informados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injeta o usuário autenticado (undefined em rota pública sem token). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<{ user?: AuthUser }>().user,
);
