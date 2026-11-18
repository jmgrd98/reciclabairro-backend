import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MemberRole } from '../../generated/prisma/client.js';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateCooperativeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, {
    message: 'Informe um CNPJ válido.',
  })
  cnpj?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, { message: 'Informe um telefone válido.' })
  phone?: string;

  @IsOptional()
  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  /** Regiões atendidas pela cooperativa. */
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  regionIds: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCooperativeDto extends PartialType(CreateCooperativeDto) {}

export class CreateMemberDto {
  @IsString()
  @MinLength(2, { message: 'Informe o nome.' })
  @MaxLength(120)
  name: string;

  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  /** Senha inicial; a pessoa pode trocá-la depois em "esqueci minha senha". */
  @IsString()
  @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres.' })
  @MaxLength(72)
  password: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, { message: 'Informe um telefone válido.' })
  phone?: string;
}

export class AdminCreateMemberDto extends CreateMemberDto {
  @IsEnum(MemberRole)
  memberRole: MemberRole;
}

export class UpdateMemberDto {
  @IsBoolean()
  active: boolean;
}
