import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Public } from '../../common/auth.js';
import { CepService } from './cep.service.js';
import {
  CreateAddressDto,
  RegisterDeviceDto,
  RemoveDeviceDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Minha conta')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Dados do usuário logado' })
  profile(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Exclui a conta e anonimiza os dados pessoais (LGPD)',
  })
  async remove(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.deleteAccount(user.id);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthUser) {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  @ApiOperation({
    summary:
      'Cadastra endereço; a região atendida é identificada automaticamente',
  })
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.users.createAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.users.updateAddress(user.id, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  async deleteAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.deleteAddress(user.id, id);
  }

  @Post('devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Registra o token de push do aparelho' })
  async registerDevice(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.users.registerDevice(user.id, dto);
  }

  @Delete('devices')
  @HttpCode(204)
  async removeDevice(
    @CurrentUser() user: AuthUser,
    @Body() dto: RemoveDeviceDto,
  ): Promise<void> {
    await this.users.removeDevice(user.id, dto.token);
  }
}

@ApiTags('Minha conta')
@Public()
@Controller('cep')
export class CepController {
  constructor(private readonly cep: CepService) {}

  @Get(':cep')
  @ApiOperation({ summary: 'Consulta um CEP para preencher o endereço' })
  lookup(@Param('cep') cep: string) {
    return this.cep.lookup(cep);
  }
}
