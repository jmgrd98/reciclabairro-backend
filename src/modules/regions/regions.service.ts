import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception.js';
import { normalizeText } from '../../common/text.js';
import type { Region } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateRegionDto, UpdateRegionDto } from './regions.dto.js';

export interface Location {
  neighborhood?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/** Distância em km entre dois pontos (fórmula de Haversine). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Escolhe a região de um local: primeiro pelo nome do bairro (na mesma cidade),
 * depois pela região cujo centro está mais perto, dentro do raio dela.
 */
export function matchRegion(
  regions: Region[],
  location: Location,
): Region | null {
  if (location.neighborhood) {
    const neighborhood = normalizeText(location.neighborhood);
    const city = location.city ? normalizeText(location.city) : null;
    const byName = regions.find(
      (region) =>
        (!city || normalizeText(region.city) === city) &&
        region.neighborhoods.some((n) => normalizeText(n) === neighborhood),
    );
    if (byName) return byName;
  }

  if (location.latitude !== undefined && location.longitude !== undefined) {
    const point = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
    let best: { region: Region; distance: number } | null = null;
    for (const region of regions) {
      if (
        region.centerLatitude === null ||
        region.centerLongitude === null ||
        region.radiusKm === null
      ) {
        continue;
      }
      const distance = distanceKm(point, {
        latitude: region.centerLatitude,
        longitude: region.centerLongitude,
      });
      if (distance <= region.radiusKm && (!best || distance < best.distance)) {
        best = { region, distance };
      }
    }
    if (best) return best.region;
  }
  return null;
}

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.region.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) {
      throw AppException.notFound('REGION_NOT_FOUND', 'Região não encontrada.');
    }
    return region;
  }

  async resolve(location: Location): Promise<Region | null> {
    const regions = await this.prisma.region.findMany({
      where: { active: true },
    });
    return matchRegion(regions, location);
  }

  create(dto: CreateRegionDto) {
    return this.prisma.region.create({
      data: { ...dto, state: dto.state.toUpperCase() },
    });
  }

  async update(id: string, dto: UpdateRegionDto) {
    await this.get(id);
    return this.prisma.region.update({
      where: { id },
      data: { ...dto, state: dto.state?.toUpperCase() },
    });
  }

  /** Regiões não são apagadas (há pedidos e endereços ligados a elas): são desativadas. */
  async deactivate(id: string) {
    await this.get(id);
    return this.prisma.region.update({
      where: { id },
      data: { active: false },
    });
  }
}
