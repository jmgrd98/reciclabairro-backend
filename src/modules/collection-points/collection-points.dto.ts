import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../common/pagination.js';
import { CollectionPointType } from '../../generated/prisma/client.js';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class CollectionPointsQuery extends PaginationQuery {
  /** Latitude de quem busca. Com lat/lng o resultado vem ordenado por distância. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  /** Raio máximo da busca, em km (exige lat/lng). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm?: number;

  /** Somente pontos que aceitam esta categoria de material. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Somente pontos que aceitam a categoria deste material do guia. */
  @IsOptional()
  @IsUUID()
  materialId?: string;

  @IsOptional()
  @IsEnum(CollectionPointType)
  type?: CollectionPointType;

  /** Somente pontos abertos agora. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  openNow?: boolean;
}

export class OpeningHoursDto {
  /** 0 = domingo … 6 = sábado */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use o formato HH:MM.' })
  opensAt: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use o formato HH:MM.' })
  closesAt: string;
}

export class CreateCollectionPointDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsEnum(CollectionPointType)
  type: CollectionPointType;

  @IsOptional()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'Informe um CEP válido.' })
  zipCode?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  street: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  number?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  neighborhood: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city: string;

  @IsString()
  @Length(2, 2, { message: 'Informe a UF com 2 letras.' })
  state: string;

  @IsLatitude({ message: 'Latitude inválida.' })
  latitude: number;

  @IsLongitude({ message: 'Longitude inválida.' })
  longitude: number;

  /** Orientações de entrega (ex.: "entregar os materiais limpos e secos"). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, { message: 'Informe um telefone válido.' })
  phone?: string;

  /** Categorias de material aceitas no ponto. */
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds: string[];

  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursDto)
  hours: OpeningHoursDto[];

  /** Cooperativa responsável (somente admin; para gestores é sempre a própria). */
  @IsOptional()
  @IsUUID()
  cooperativeId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCollectionPointDto extends PartialType(
  CreateCollectionPointDto,
) {}
