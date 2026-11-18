import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.js';
import { SkipRateLimit } from '../../common/rate-limit.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('Infra')
@Public()
@SkipRateLimit()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Verifica se a API e o banco estão respondendo' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }
    return { status: 'ok', database: 'ok', time: new Date().toISOString() };
  }
}
