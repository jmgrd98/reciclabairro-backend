import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../common/pagination.js';
import {
  Period,
  PickupStatus,
  QuantityUnit,
} from '../../generated/prisma/client.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Use a data no formato AAAA-MM-DD.';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class PickupItemDto {
  /** Categoria do material (papel, plástico, vidro…). */
  @IsUUID()
  categoryId: string;

  @IsNumber()
  @Min(0.1, { message: 'Informe uma quantidade maior que zero.' })
  @Max(10000)
  quantity: number;

  @IsEnum(QuantityUnit)
  unit: QuantityUnit;
}

export class CreatePickupRequestDto {
  /** Endereço cadastrado do solicitante onde a retirada será feita. */
  @IsUUID()
  addressId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um tipo de material.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PickupItemDto)
  items: PickupItemDto[];

  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  preferredDate?: string;

  @IsOptional()
  @IsEnum(Period)
  preferredPeriod?: Period;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MyPickupRequestsQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(PickupStatus)
  status?: PickupStatus;

  /** true = só abertas; false = só encerradas (histórico). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  open?: boolean;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RequiredReasonDto {
  @IsString()
  @MinLength(3, { message: 'Explique o motivo para o solicitante.' })
  @MaxLength(500)
  reason: string;
}

// ───────────── Cooperativa ─────────────

export class CooperativeQueueQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(PickupStatus)
  status?: PickupStatus;

  @IsOptional()
  @IsUUID()
  regionId?: string;

  @IsOptional()
  @IsUUID()
  materialCategoryId?: string;

  @IsOptional()
  @IsUUID()
  collectorId?: string;

  /** Pedidos criados a partir desta data (AAAA-MM-DD). */
  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  from?: string;

  /** Pedidos criados até esta data (AAAA-MM-DD). */
  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  to?: string;

  /** Pedidos agendados para este dia (AAAA-MM-DD). */
  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  scheduledDate?: string;

  /** Somente pedidos atrasados. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  late?: boolean;

  /** Busca pelo número de protocolo. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  protocol?: string;
}

export class SchedulePickupDto {
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  scheduledDate: string;

  @IsOptional()
  @IsEnum(Period)
  scheduledPeriod?: Period;

  @IsOptional()
  @IsUUID()
  collectorId?: string;

  /** Recado ao solicitante. Obrigatório ao reagendar. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class AssignCollectorDto {
  @IsUUID()
  collectorId: string;
}

// ───────────── Coletor ─────────────

export class CollectorPickupsQuery {
  /** Dia das coletas (AAAA-MM-DD). Padrão: hoje. */
  @IsOptional()
  @Matches(DATE_ONLY, { message: DATE_MESSAGE })
  date?: string;
}

export class CompletePickupDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Registre ao menos um material recolhido.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PickupItemDto)
  collectedItems: PickupItemDto[];

  /** Observação sobre o atendimento. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
