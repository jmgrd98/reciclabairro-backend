import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception.js';
import { skipTake, toPage } from '../../common/pagination.js';
import { normalizeText, slugify } from '../../common/text.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateCategoryDto,
  CreateMaterialDto,
  MaterialsQuery,
  UpdateCategoryDto,
  UpdateMaterialDto,
} from './materials.dto.js';

export function buildSearchText(name: string, synonyms: string[] = []): string {
  return normalizeText([name, ...synonyms].join(' '));
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Categorias ─────────────

  listCategories() {
    return this.prisma.materialCategory.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.materialCategory.create({
      data: { ...dto, slug: slugify(dto.name) },
    });
  }

  updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.prisma.materialCategory.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) },
    });
  }

  // ───────────── Guia de materiais ─────────────

  async list(query: MaterialsQuery, includeInactive = false) {
    const where: Prisma.MaterialWhereInput = {
      ...(includeInactive ? {} : { active: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.recyclable !== undefined
        ? { recyclable: query.recyclable }
        : {}),
      ...(query.search
        ? { searchText: { contains: normalizeText(query.search) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        include: { category: true },
        orderBy: { name: 'asc' },
        ...skipTake(query),
      }),
      this.prisma.material.count({ where }),
    ]);
    return toPage(
      items.map(({ searchText: _searchText, ...material }) => material),
      total,
      query,
    );
  }

  /** Detalhe do material. Cada consulta conta para o indicador "uso do guia". */
  async get(id: string, viewerId?: string) {
    const material = await this.prisma.material.findFirst({
      where: { id, active: true },
      include: { category: true },
    });
    if (!material) {
      throw AppException.notFound(
        'MATERIAL_NOT_FOUND',
        'Material não encontrado no guia.',
      );
    }
    await this.prisma.materialGuideView.create({
      data: { materialId: id, userId: viewerId ?? null },
    });
    const { searchText: _searchText, ...rest } = material;
    return rest;
  }

  create(dto: CreateMaterialDto) {
    return this.prisma.material.create({
      data: {
        ...dto,
        synonyms: dto.synonyms ?? [],
        searchText: buildSearchText(dto.name, dto.synonyms),
      },
    });
  }

  async update(id: string, dto: UpdateMaterialDto) {
    const current = await this.prisma.material.findUnique({ where: { id } });
    if (!current) {
      throw AppException.notFound(
        'MATERIAL_NOT_FOUND',
        'Material não encontrado no guia.',
      );
    }
    return this.prisma.material.update({
      where: { id },
      data: {
        ...dto,
        searchText: buildSearchText(
          dto.name ?? current.name,
          dto.synonyms ?? current.synonyms,
        ),
      },
    });
  }
}
