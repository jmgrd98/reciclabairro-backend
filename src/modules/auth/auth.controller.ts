import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.js';
import { RateLimit } from '../../common/rate-limit.js';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';

/** Limite mais rígido nas rotas sensíveis a força bruta. */
const STRICT = { limit: 10, ttl: 60_000 };

@ApiTags('Autenticação')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit(STRICT)
  @ApiOperation({
    summary: 'Cadastra morador ou comerciante e já devolve os tokens',
  })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit(STRICT)
  @ApiOperation({ summary: 'Entra com e-mail e senha' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Troca o refresh token por um novo par de tokens' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão (revoga o refresh token)' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(204)
  @RateLimit(STRICT)
  @ApiOperation({
    summary: 'Envia e-mail com o código de redefinição de senha',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(204)
  @RateLimit(STRICT)
  @ApiOperation({
    summary: 'Define nova senha a partir do código recebido por e-mail',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }
}
