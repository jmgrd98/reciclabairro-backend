import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/client.js';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Informe seu nome.' })
  @MaxLength(120)
  name: string;

  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres.' })
  @MaxLength(72)
  password: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, { message: 'Informe um telefone válido.' })
  phone?: string;

  /** Somente MORADOR ou COMERCIANTE podem se cadastrar por conta própria. */
  @IsOptional()
  @IsIn([Role.MORADOR, Role.COMERCIANTE], {
    message: 'Tipo de conta inválido.',
  })
  role?: Role;

  /** Consentimento com o tratamento de dados (LGPD). Precisa ser true. */
  @Equals(true, {
    message: 'É preciso aceitar os termos de uso e a política de privacidade.',
  })
  acceptTerms: boolean;
}

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Informe sua senha.' })
  password: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken: string;
}

export class ForgotPasswordDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres.' })
  @MaxLength(72)
  password: string;
}
