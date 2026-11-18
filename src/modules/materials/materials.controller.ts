import {
  Body,
  Controller,
  Get,
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
import { Role } from '../../generated/prisma/client.js';
import {
  CreateCategoryDto,
  CreateMaterialDto,
  MaterialsQuery,
  UpdateCategoryDto,
  UpdateMaterialDto,
} from './materials.dto.js';
import { MaterialsService } from './materials.service.js';

@ApiTags('Guia de materiais')
@Public()
@Controller()
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get('material-categories')
  @ApiOperation({
    summary: 'Categorias de materiais (papel, plástico, vidro…)',
  })
  categories() {
    return this.materials.listCategories();
  }

  @Get('materials')
  @ApiOperation({ summary: 'Busca no guia de materiais' })
  list(@Query() query: MaterialsQuery) {
    return this.materials.list(query);
  }

  @Get('materials/:id')
  @ApiOperation({ summary: 'Como separar e descartar um material' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.materials.get(id, user?.id);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.EDUCADOR)
@Controller('admin')
export class AdminMaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Post('material-categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.materials.createCategory(dto);
  }

  @Patch('material-categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.materials.updateCategory(id, dto);
  }

  @Get('materials')
  @ApiOperation({ summary: 'Lista o guia incluindo materiais inativos' })
  list(@Query() query: MaterialsQuery) {
    return this.materials.list(query, true);
  }

  @Post('materials')
  create(@Body() dto: CreateMaterialDto) {
    return this.materials.create(dto);
  }

  @Patch('materials/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.materials.update(id, dto);
  }
}
