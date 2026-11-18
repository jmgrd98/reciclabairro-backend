import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../../common/auth.js';
import { Role } from '../../generated/prisma/client.js';
import {
  AssignCollectorDto,
  CollectorPickupsQuery,
  CompletePickupDto,
  CooperativeQueueQuery,
  CreatePickupRequestDto,
  MyPickupRequestsQuery,
  OptionalReasonDto,
  RequiredReasonDto,
  SchedulePickupDto,
} from './pickup-requests.dto.js';
import { PickupRequestsService } from './pickup-requests.service.js';

@ApiTags('Solicitações de retirada')
@ApiBearerAuth()
@Roles(Role.MORADOR, Role.COMERCIANTE)
@Controller('pickup-requests')
export class PickupRequestsController {
  constructor(private readonly pickups: PickupRequestsService) {}

  @Post()
  @ApiOperation({
    summary: 'Solicita uma retirada; devolve o número de protocolo',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePickupRequestDto) {
    return this.pickups.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Minhas solicitações (painel e histórico de descarte)',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: MyPickupRequestsQuery) {
    return this.pickups.listMine(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da solicitação com a linha do tempo' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pickups.getMine(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela a solicitação (até estar agendada)' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionalReasonDto,
  ) {
    return this.pickups.cancelByRequester(user, id, dto.reason);
  }
}

@ApiTags('Cooperativa')
@ApiBearerAuth()
@Roles(Role.GESTOR_COOPERATIVA)
@Controller('cooperative/pickup-requests')
export class CooperativePickupRequestsController {
  constructor(private readonly pickups: PickupRequestsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Painel da cooperativa: filtros por região, material, data, status e atraso',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: CooperativeQueueQuery) {
    return this.pickups.listQueue(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pickups.getForCooperative(user, id);
  }

  @Post(':id/start-review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Assume o pedido para a cooperativa e inicia a análise',
  })
  startReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pickups.startReview(user, id);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirma a coleta com uma data, ou reagenda' })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SchedulePickupDto,
  ) {
    return this.pickups.schedule(user, id, dto);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Distribui a coleta para um coletor' })
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCollectorDto,
  ) {
    return this.pickups.assign(user, id, dto.collectorId);
  }

  @Post(':id/refuse')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Recusa o pedido, informando o motivo ao solicitante',
  })
  refuse(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredReasonDto,
  ) {
    return this.pickups.refuse(user, id, dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancela o pedido, informando o motivo ao solicitante',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredReasonDto,
  ) {
    return this.pickups.cancelByCooperative(user, id, dto.reason);
  }
}

@ApiTags('Coletor')
@ApiBearerAuth()
@Controller('collector/pickups')
export class CollectorPickupsController {
  constructor(private readonly pickups: PickupRequestsService) {}

  @Get()
  @Roles(Role.COLETOR)
  @ApiOperation({
    summary: 'Coletas do coletor no dia (padrão: hoje e vencidas)',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: CollectorPickupsQuery) {
    return this.pickups.listForCollector(user, query.date);
  }

  @Get(':id')
  @Roles(Role.COLETOR, Role.GESTOR_COOPERATIVA)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pickups.getForStaff(user, id);
  }

  @Post(':id/start-route')
  @HttpCode(200)
  @Roles(Role.COLETOR, Role.GESTOR_COOPERATIVA)
  @ApiOperation({ summary: 'Marca a coleta como em rota (só no dia agendado)' })
  startRoute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pickups.startRoute(user, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(Role.COLETOR, Role.GESTOR_COOPERATIVA)
  @ApiOperation({
    summary: 'Conclui a coleta registrando os materiais recolhidos',
  })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompletePickupDto,
  ) {
    return this.pickups.complete(user, id, dto);
  }

  @Post(':id/not-collected')
  @HttpCode(200)
  @Roles(Role.COLETOR, Role.GESTOR_COOPERATIVA)
  @ApiOperation({ summary: 'Registra que a coleta não pôde ser realizada' })
  notCollected(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredReasonDto,
  ) {
    return this.pickups.notCollected(user, id, dto.reason);
  }
}
