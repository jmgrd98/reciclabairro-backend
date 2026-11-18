import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../common/app.exception.js';
import { PICKUP_EVENT, type PickupEvent } from '../../common/events.js';
import { PickupStatus, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toPublicUser } from '../auth/auth.service.js';
import { RegionsService } from '../regions/regions.service.js';
import type {
  CreateAddressDto,
  RegisterDeviceDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './users.dto.js';

const CANCELLABLE_ON_DELETE: PickupStatus[] = [
  PickupStatus.SOLICITADA,
  PickupStatus.EM_ANALISE,
  PickupStatus.AGENDADA,
];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly regions: RegionsService,
    private readonly events: EventEmitter2,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: {
          include: { cooperative: { select: { id: true, name: true } } },
        },
      },
    });
    if (!user || !user.active) {
      throw AppException.unauthorized(
        'ACCOUNT_UNAVAILABLE',
        'Esta conta não está mais disponível.',
      );
    }
    return {
      ...toPublicUser(user),
      createdAt: user.createdAt,
      cooperative: user.membership?.active
        ? {
            id: user.membership.cooperative.id,
            name: user.membership.cooperative.name,
            memberRole: user.membership.role,
          }
        : null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name?.trim(), phone: dto.phone },
    });
    return this.getProfile(userId);
  }

  /**
   * Exclusão de conta (LGPD): os dados pessoais são apagados ou anonimizados,
   * mas os pedidos permanecem, sem endereço, para manter os indicadores.
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.role !== Role.MORADOR && user.role !== Role.COMERCIANTE) {
      throw AppException.forbidden(
        'STAFF_ACCOUNT',
        'Contas de equipe são removidas pelo administrador ou pelo gestor da cooperativa.',
      );
    }
    const inRoute = await this.prisma.pickupRequest.count({
      where: { requesterId: userId, status: PickupStatus.EM_ROTA },
    });
    if (inRoute > 0) {
      throw AppException.conflict(
        'PICKUP_IN_ROUTE',
        'Há uma coleta a caminho. Aguarde a conclusão para excluir sua conta.',
      );
    }

    const open = await this.prisma.pickupRequest.findMany({
      where: { requesterId: userId, status: { in: CANCELLABLE_ON_DELETE } },
      select: { id: true, status: true },
    });
    const comment = 'Conta excluída pelo usuário.';
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const request of open) {
        await tx.pickupRequest.update({
          where: { id: request.id },
          data: {
            status: PickupStatus.CANCELADA,
            closingReason: comment,
            closedAt: now,
          },
        });
        await tx.pickupStatusHistory.create({
          data: {
            requestId: request.id,
            fromStatus: request.status,
            toStatus: PickupStatus.CANCELADA,
            kind: 'CANCELLED_BY_REQUESTER',
            authorId: userId,
            comment,
          },
        });
      }
      await tx.pickupRequest.updateMany({
        where: { requesterId: userId },
        data: {
          addressText: 'Endereço removido',
          latitude: 0,
          longitude: 0,
          requesterNotes: null,
        },
      });
      await tx.address.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Usuário removido',
          email: `removido-${userId}@anon.invalid`,
          phone: null,
          passwordHash: randomBytes(32).toString('hex'),
          active: false,
          deletedAt: now,
        },
      });
    });

    for (const request of open) {
      const event: PickupEvent = {
        requestId: request.id,
        kind: 'CANCELLED_BY_REQUESTER',
        from: request.status,
        to: PickupStatus.CANCELADA,
        authorId: userId,
        comment,
      };
      // A conta já foi excluída; uma falha ao avisar a equipe não pode desfazer isso.
      await this.events.emitAsync(PICKUP_EVENT, event).catch(() => undefined);
    }
  }

  // ───────────── Endereços ─────────────

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      include: { region: { select: { id: true, name: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const region = await this.regions.resolve(dto);
    const count = await this.prisma.address.count({ where: { userId } });
    const isPrimary = dto.isPrimary ?? count === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.address.updateMany({
          where: { userId },
          data: { isPrimary: false },
        });
      }
      return tx.address.create({
        data: {
          ...dto,
          state: dto.state.toUpperCase(),
          userId,
          isPrimary,
          regionId: region?.id ?? null,
        },
        include: { region: { select: { id: true, name: true } } },
      });
    });
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    const current = await this.getOwnAddress(userId, id);
    const merged = { ...current, ...dto };
    const region = await this.regions.resolve(merged);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.address.updateMany({
          where: { userId, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      return tx.address.update({
        where: { id },
        data: {
          ...dto,
          state: dto.state?.toUpperCase(),
          regionId: region?.id ?? null,
        },
        include: { region: { select: { id: true, name: true } } },
      });
    });
  }

  async deleteAddress(userId: string, id: string): Promise<void> {
    await this.getOwnAddress(userId, id);
    await this.prisma.address.delete({ where: { id } });
  }

  private async getOwnAddress(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address || address.userId !== userId) {
      throw AppException.notFound(
        'ADDRESS_NOT_FOUND',
        'Endereço não encontrado.',
      );
    }
    return address;
  }

  // ───────────── Dispositivos (push) ─────────────

  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform },
    });
  }

  async removeDevice(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }
}
