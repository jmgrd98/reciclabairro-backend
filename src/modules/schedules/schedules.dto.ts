import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Period } from '../../generated/prisma/client.js';

export class ScheduleLookupQuery {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}

export class CreateScheduleDto {
  @IsUUID()
  regionId: string;

  /** 0 = domingo … 6 = sábado */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @IsEnum(Period)
  period: Period;

  /** Categorias recolhidas nesse dia. */
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {}

export class CreateScheduleExceptionDto {
  @IsUUID()
  regionId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Use a data no formato AAAA-MM-DD.',
  })
  date: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason: string;
}
