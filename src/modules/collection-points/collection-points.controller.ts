import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '../../common/auth.js';
import { PaginationQuery } from '../../common/pagination.js';
import { Role } from '../../generated/prisma/client.js';
import {
  CollectionPointsQuery,
  CreateCollectionPointDto,
  UpdateCollectionPointDto,
} from './collection-points.dto.js';
import { CollectionPointsService } from './collection-points.service.js';

@ApiTags('Pontos de coleta')
@Public()
@Controller('collection-points')
export class CollectionPointsController {
  constructor(private readonly points: CollectionPointsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Mapa de pontos de entrega: por proximidade, material aceito e horário',
  })
  search(@Query() query: CollectionPointsQuery) {
    return this.points.search(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.points.get(id);
  }
}

@ApiTags('Pontos de coleta')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.GESTOR_COOPERATIVA)
@Controller('collection-points')
export class ManageCollectionPointsController {
  constructor(private readonly points: CollectionPointsService) {}

  @Get('manage')
  @ApiOperation({
    summary:
      'Pontos para gestão: admin vê todos (inclusive inativos); gestor, os da sua cooperativa',
  })
  listForManagement(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQuery,
  ) {
    return this.points.listForManagement(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra ponto de coleta (admin ou gestor)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCollectionPointDto) {
    return this.points.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCollectionPointDto,
  ) {
    return this.points.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desativa o ponto de coleta' })
  async deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.points.deactivate(user, id);
  }
}
