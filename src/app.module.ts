import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard, RolesGuard } from './common/guards.js';
import { RateLimitGuard } from './common/rate-limit.js';
import { validateEnv } from './config/env.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CollectionPointsModule } from './modules/collection-points/collection-points.module.js';
import { CooperativesModule } from './modules/cooperatives/cooperatives.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { MailModule } from './modules/mail/mail.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PickupRequestsModule } from './modules/pickup-requests/pickup-requests.module.js';
import { RegionsModule } from './modules/regions/regions.module.js';
import { SchedulesModule } from './modules/schedules/schedules.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthModule,
    RegionsModule,
    UsersModule,
    MaterialsModule,
    CollectionPointsModule,
    SchedulesModule,
    CooperativesModule,
    PickupRequestsModule,
    NotificationsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
