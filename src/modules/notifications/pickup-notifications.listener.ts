import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { dateToDateOnly } from '../../common/dates.js';
import { PICKUP_EVENT, type PickupEvent } from '../../common/events.js';
import { MemberRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { buildPickupNotifications } from './pickup-messages.js';

/** Transforma cada mudança de uma solicitação em notificações para os envolvidos. */
@Injectable()
export class PickupNotificationsListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(PICKUP_EVENT)
  async handle(event: PickupEvent): Promise<void> {
    const request = await this.prisma.pickupRequest.findUnique({
      where: { id: event.requestId },
      include: { cooperative: { select: { name: true } } },
    });
    if (!request) return;

    const managers = await this.prisma.cooperativeMember.findMany({
      where: {
        role: MemberRole.GESTOR,
        active: true,
        cooperative: request.cooperativeId
          ? { id: request.cooperativeId }
          : { active: true, regions: { some: { regionId: request.regionId } } },
      },
      select: { userId: true },
    });

    const messages = buildPickupNotifications(event, {
      id: request.id,
      protocol: request.protocol ?? request.id,
      requesterId: request.requesterId,
      collectorId: request.collectorId,
      cooperativeName: request.cooperative?.name ?? null,
      scheduledDate: request.scheduledDate
        ? dateToDateOnly(request.scheduledDate)
        : null,
      scheduledPeriod: request.scheduledPeriod,
      managerIds: managers.map((member) => member.userId),
    });
    await this.notifications.notify(messages);
  }
}
