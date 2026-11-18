import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../../common/pagination.js';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class MaterialsQuery extends PaginationQuery {
  /** Busca por nome ou sinônimo (ignora acentos e maiúsculas). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  recyclable?: boolean;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateMaterialDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsBoolean()
  recyclable: boolean;

  /** Como preparar/separar o material antes do descarte. */
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  preparation: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  synonyms?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMaterialDto extends PartialType(CreateMaterialDto) {}
