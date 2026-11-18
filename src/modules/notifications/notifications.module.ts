import { Module } from '@nestjs/common';
import { CronController } from './cron.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PickupNotificationsListener } from './pickup-notifications.listener.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [NotificationsController, CronController],
  providers: [NotificationsService, PushService, PickupNotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
