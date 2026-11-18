import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRegionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city: string;

  @IsString()
  @Length(2, 2, { message: 'Informe a UF com 2 letras.' })
  state: string;

  /** Bairros atendidos; usados para associar endereços à região. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  neighborhoods: string[];

  @IsOptional()
  @IsLatitude()
  centerLatitude?: number;

  @IsOptional()
  @IsLongitude()
  centerLongitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  radiusKm?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRegionDto extends PartialType(CreateRegionDto) {}
