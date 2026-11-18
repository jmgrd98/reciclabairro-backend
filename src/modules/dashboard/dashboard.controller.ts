import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { type AuthUser, CurrentUser, Roles } from '../../common/auth.js';
import { MemberRole, Role } from '../../generated/prisma/client.js';
import { CooperativesService } from '../cooperatives/cooperatives.service.js';
import { DashboardService } from './dashboard.service.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Use a data no formato AAAA-MM-DD.';

export class DashboardQuery {
  /** Início do período (AAAA-MM-DD), pela data de criação do pedido. */
  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  to?: string;

  @IsOptional()
  @IsUUID()
  regionId?: string;
}

@ApiTags('Indicadores')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly cooperatives: CooperativesService,
  ) {}

  @Get('cooperative/dashboard')
  @Roles(Role.GESTOR_COOPERATIVA)
  @ApiOperation({ summary: 'Indicadores dos atendimentos da cooperativa' })
  async cooperative(
    @CurrentUser() user: AuthUser,
    @Query() query: DashboardQuery,
  ) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    return this.dashboard.overview(
      {
        cooperativeId,
        ...(query.regionId ? { regionId: query.regionId } : {}),
      },
      query,
      false,
    );
  }

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.EDUCADOR)
  @ApiOperation({
    summary:
      'Indicadores gerais da plataforma (dados agregados, sem dados pessoais)',
  })
  admin(@Query() query: DashboardQuery) {
    return this.dashboard.overview(
      query.regionId ? { regionId: query.regionId } : {},
      query,
      true,
    );
  }
}
