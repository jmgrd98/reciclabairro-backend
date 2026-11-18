import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DevicePlatform } from '../../generated/prisma/client.js';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe seu nome.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, { message: 'Informe um telefone válido.' })
  phone?: string;
}

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @Matches(/^\d{5}-?\d{3}$/, { message: 'Informe um CEP válido.' })
  zipCode: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  street: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  number: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  complement?: string;

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

  /** Coordenadas escolhidas no mapa pelo aplicativo. */
  @IsLatitude({ message: 'Latitude inválida.' })
  latitude: number;

  @IsLongitude({ message: 'Longitude inválida.' })
  longitude: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(400)
  token: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}

export class RemoveDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(400)
  token: string;
}
