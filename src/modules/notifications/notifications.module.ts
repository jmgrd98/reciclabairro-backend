import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PickupNotificationsListener } from './pickup-notifications.listener.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, PickupNotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
