import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { AppException } from '../../common/app.exception.js';
import { Role, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';

const RESET_TOKEN_TTL_MINUTES = 60;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Validade do accessToken, em segundos. */
  expiresIn: number;
  user: PublicUser;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

/**
 * Um refresh token já trocado foi apresentado de novo. Logo após a troca isso
 * costuma ser só uma corrida (duas abas ou instâncias renovando ao mesmo tempo);
 * passado o prazo de tolerância, tratamos como token roubado.
 */
export function isSuspiciousReuse(
  revokedAt: Date,
  now: Date,
  graceSeconds: number,
): boolean {
  return now.getTime() - revokedAt.getTime() > graceSeconds * 1000;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Hash usado quando o e-mail não existe, para o tempo de resposta não revelar isso. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw AppException.conflict(
        'EMAIL_IN_USE',
        'Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.',
      );
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email,
        phone: dto.phone ?? null,
        passwordHash: await this.hashPassword(dto.password),
        role: dto.role ?? Role.MORADOR,
        lgpdConsentAt: new Date(),
      },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    this.dummyHash ??= argon2.hash('senha-inexistente');
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const valid = await argon2.verify(hash, dto.password).catch(() => false);
    if (!user || !valid || !user.active) {
      throw AppException.unauthorized(
        'INVALID_CREDENTIALS',
        'E-mail ou senha incorretos.',
      );
    }
    return this.issueTokens(user);
  }

  /** Troca o refresh token por um novo par (rotação). Reuso de token revogado derruba todas as sessões. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    const invalid = AppException.unauthorized(
      'INVALID_REFRESH_TOKEN',
      'Sua sessão expirou. Faça login novamente.',
    );
    if (!stored) throw invalid;
    if (stored.revokedAt) {
      const graceSeconds = this.config.getOrThrow<number>(
        'REFRESH_REUSE_GRACE_SECONDS',
      );
      if (isSuspiciousReuse(stored.revokedAt, new Date(), graceSeconds)) {
        await this.revokeAllSessions(stored.userId);
      }
      throw invalid;
    }
    if (stored.expiresAt < new Date() || !stored.user.active) throw invalid;

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw invalid;
    return this.issueTokens(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Sempre responde igual, exista ou não a conta, para não revelar e-mails cadastrados. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) return;

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
      },
    });
    const baseUrl = this.config.getOrThrow<string>('APP_PUBLIC_URL');
    try {
      await this.mail.send({
        to: user.email,
        subject: 'ReciclaBairro — redefinição de senha',
        text: [
          `Olá, ${user.name}!`,
          '',
          'Recebemos um pedido para redefinir sua senha no ReciclaBairro.',
          `Use este código no aplicativo (válido por ${RESET_TOKEN_TTL_MINUTES} minutos):`,
          '',
          token,
          '',
          `Ou acesse: ${baseUrl}/redefinir-senha?token=${token}`,
          '',
          'Se você não fez esse pedido, pode ignorar este e-mail.',
        ].join('\n'),
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar e-mail de redefinição: ${String(error)}`,
      );
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw AppException.badRequest(
        'INVALID_RESET_TOKEN',
        'Este link de redefinição é inválido ou expirou. Peça um novo.',
      );
    }
    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn, user: toPublicUser(user) };
  }
}
