import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception.js';
import {
  MemberRole,
  PickupStatus,
  Role,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import type {
  CreateCooperativeDto,
  CreateMemberDto,
  UpdateCooperativeDto,
} from './cooperatives.dto.js';

export interface Membership {
  cooperativeId: string;
  role: MemberRole;
}

const MEMBER_SELECT = {
  id: true,
  role: true,
  active: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

@Injectable()
export class CooperativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Vínculo ativo do usuário com uma cooperativa; 403 se não houver (ou se o papel não bater). */
  async requireMembership(
    userId: string,
    role?: MemberRole,
  ): Promise<Membership> {
    const member = await this.prisma.cooperativeMember.findUnique({
      where: { userId },
      include: { cooperative: { select: { active: true } } },
    });
    if (
      !member ||
      !member.active ||
      !member.cooperative.active ||
      (role && member.role !== role)
    ) {
      throw AppException.forbidden(
        'NOT_A_COOPERATIVE_MEMBER',
        'Seu usuário não está vinculado a uma cooperativa ativa.',
      );
    }
    return { cooperativeId: member.cooperativeId, role: member.role };
  }

  async regionIdsOf(cooperativeId: string): Promise<string[]> {
    const rows = await this.prisma.cooperativeRegion.findMany({
      where: { cooperativeId },
      select: { regionId: true },
    });
    return rows.map((row) => row.regionId);
  }

  // ───────────── Admin ─────────────

  list() {
    return this.prisma.cooperative.findMany({
      include: {
        regions: { include: { region: { select: { id: true, name: true } } } },
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const cooperative = await this.prisma.cooperative.findUnique({
      where: { id },
      include: {
        regions: { include: { region: { select: { id: true, name: true } } } },
        members: { select: MEMBER_SELECT, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!cooperative) {
      throw AppException.notFound(
        'COOPERATIVE_NOT_FOUND',
        'Cooperativa não encontrada.',
      );
    }
    return cooperative;
  }

  async create(dto: CreateCooperativeDto) {
    const { regionIds, ...data } = dto;
    const created = await this.prisma.cooperative.create({
      data: {
        ...data,
        regions: { create: regionIds.map((regionId) => ({ regionId })) },
      },
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateCooperativeDto) {
    const { regionIds, ...data } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.cooperative.update({ where: { id }, data });
      if (regionIds) {
        await tx.cooperativeRegion.deleteMany({ where: { cooperativeId: id } });
        await tx.cooperativeRegion.createMany({
          data: regionIds.map((regionId) => ({ cooperativeId: id, regionId })),
        });
      }
    });
    return this.get(id);
  }

  // ───────────── Membros ─────────────

  listMembers(cooperativeId: string) {
    return this.prisma.cooperativeMember.findMany({
      where: { cooperativeId },
      select: MEMBER_SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Cria a conta de um gestor ou coletor já vinculada à cooperativa. */
  async addMember(
    cooperativeId: string,
    dto: CreateMemberDto,
    memberRole: MemberRole,
  ) {
    await this.get(cooperativeId);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw AppException.conflict(
        'EMAIL_IN_USE',
        'Já existe uma conta com este e-mail.',
      );
    }
    const passwordHash = await this.auth.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email,
        phone: dto.phone ?? null,
        passwordHash,
        role:
          memberRole === MemberRole.GESTOR
            ? Role.GESTOR_COOPERATIVA
            : Role.COLETOR,
        lgpdConsentAt: new Date(),
        membership: { create: { cooperativeId, role: memberRole } },
      },
      include: { membership: { select: MEMBER_SELECT } },
    });
    return user.membership;
  }

  /** Ativa ou desativa um membro. Ao desativar, a pessoa perde o acesso e suas coletas agendadas ficam sem coletor. */
  async setMemberActive(
    cooperativeId: string,
    memberId: string,
    active: boolean,
  ) {
    const member = await this.prisma.cooperativeMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.cooperativeId !== cooperativeId) {
      throw AppException.notFound('MEMBER_NOT_FOUND', 'Membro não encontrado.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.userId },
        data: { active },
      });
      if (!active) {
        await tx.refreshToken.updateMany({
          where: { userId: member.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.pickupRequest.updateMany({
          where: {
            collectorId: member.userId,
            status: PickupStatus.AGENDADA,
          },
          data: { collectorId: null },
        });
      }
      return tx.cooperativeMember.update({
        where: { id: memberId },
        data: { active },
        select: MEMBER_SELECT,
      });
    });
  }
}
