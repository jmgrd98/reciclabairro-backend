import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../../common/auth.js';
import { MemberRole, Role } from '../../generated/prisma/client.js';
import {
  AdminCreateMemberDto,
  CreateCooperativeDto,
  CreateMemberDto,
  UpdateCooperativeDto,
  UpdateMemberDto,
} from './cooperatives.dto.js';
import { CooperativesService } from './cooperatives.service.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/cooperatives')
export class AdminCooperativesController {
  constructor(private readonly cooperatives: CooperativesService) {}

  @Get()
  list() {
    return this.cooperatives.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.cooperatives.get(id);
  }

  @Post()
  create(@Body() dto: CreateCooperativeDto) {
    return this.cooperatives.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCooperativeDto,
  ) {
    return this.cooperatives.update(id, dto);
  }

  @Post(':id/members')
  @ApiOperation({
    summary: 'Cria a conta de um gestor ou coletor da cooperativa',
  })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCreateMemberDto,
  ) {
    const { memberRole, ...member } = dto;
    return this.cooperatives.addMember(id, member, memberRole);
  }
}

@ApiTags('Cooperativa')
@ApiBearerAuth()
@Roles(Role.GESTOR_COOPERATIVA)
@Controller('cooperative/members')
export class CooperativeMembersController {
  constructor(private readonly cooperatives: CooperativesService) {}

  @Get()
  @ApiOperation({ summary: 'Equipe da cooperativa (gestores e coletores)' })
  async list(@CurrentUser() user: AuthUser) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    return this.cooperatives.listMembers(cooperativeId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra um coletor na cooperativa' })
  async addCollector(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMemberDto,
  ) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    return this.cooperatives.addMember(cooperativeId, dto, MemberRole.COLETOR);
  }

  @Patch(':memberId')
  @ApiOperation({ summary: 'Ativa ou desativa um membro da equipe' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    const { cooperativeId } = await this.cooperatives.requireMembership(
      user.id,
      MemberRole.GESTOR,
    );
    return this.cooperatives.setMemberActive(
      cooperativeId,
      memberId,
      dto.active,
    );
  }
}
