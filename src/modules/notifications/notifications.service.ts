import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AppException } from '../../common/app.exception.js';
import { runAfterResponse } from '../../common/background.js';
import {
  type PaginationQuery,
  skipTake,
  toPage,
} from '../../common/pagination.js';
import {
  DeliveryStatus,
  NotificationChannel,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import type { OutgoingNotification } from './pickup-messages.js';
import { PushService } from './push.service.js';

const MAX_ATTEMPTS = 5;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly isTest: boolean;
  private readonly immediate: boolean;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
    config: ConfigService,
  ) {
    this.isTest = config.get<string>('NODE_ENV') === 'test';
    this.immediate =
      config.get<string>('NOTIFICATION_DISPATCH') === 'immediate';
  }

  /**
   * Grava a notificação (já disponível no app) e enfileira os envios externos
   * (e-mail e push). No modo "immediate", eles saem logo após a resposta;
   * no modo "interval", o job agendado cuida deles.
   */
  async notify(messages: OutgoingNotification[]): Promise<void> {
    const queued: string[] = [];
    for (const message of messages) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: message.userIds }, active: true },
        select: { id: true, _count: { select: { deviceTokens: true } } },
      });
      for (const user of users) {
        const deliveries: Prisma.NotificationDeliveryCreateWithoutNotificationInput[] =
          [
            {
              channel: NotificationChannel.IN_APP,
              status: DeliveryStatus.ENVIADA,
              sentAt: new Date(),
            },
          ];
        if (message.email) {
          deliveries.push({ channel: NotificationChannel.EMAIL });
        }
        if (this.push.enabled && user._count.deviceTokens > 0) {
          deliveries.push({ channel: NotificationChannel.PUSH });
        }
        const created = await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: message.type,
            title: message.title,
            body: message.body,
            data: message.data,
            deliveries: { create: deliveries },
          },
          include: {
            deliveries: {
              where: { status: DeliveryStatus.PENDENTE },
              select: { id: true },
            },
          },
        });
        queued.push(...created.deliveries.map((delivery) => delivery.id));
      }
    }
    if (this.immediate && queued.length > 0) {
      runAfterResponse('Envio de avisos', this.dispatchPending(50, queued));
    }
  }

  @Interval(15_000)
  async tick(): Promise<void> {
    if (this.isTest || this.immediate) return;
    await this.dispatchPending();
  }

  /**
   * Envia e-mails e pushes pendentes (todos, ou só os `ids` informados) e
   * devolve quantos foram enviados. Cada envio é "reservado" no banco antes de
   * sair, para que duas execuções simultâneas (duas instâncias serverless, ou
   * o envio imediato e a rotina diária) nunca mandem o mesmo aviso duas vezes.
   */
  async dispatchPending(limit = 50, ids?: string[]): Promise<number> {
    // A trava em memória vale para o job periódico; envios imediatos de
    // requisições diferentes podem rodar juntos (a reserva no banco os separa).
    if (!ids && this.dispatching) return 0;
    if (!ids) this.dispatching = true;
    let sent = 0;
    try {
      const pending = await this.prisma.notificationDelivery.findMany({
        where: {
          ...(ids ? { id: { in: ids } } : {}),
          status: DeliveryStatus.PENDENTE,
          attempts: { lt: MAX_ATTEMPTS },
          channel: {
            in: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
          },
        },
        include: {
          notification: {
            include: {
              user: {
                select: {
                  email: true,
                  name: true,
                  active: true,
                  deviceTokens: { select: { token: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      for (const delivery of pending) {
        const { notification } = delivery;
        const claimed = await this.prisma.notificationDelivery.updateMany({
          where: {
            id: delivery.id,
            status: DeliveryStatus.PENDENTE,
            attempts: delivery.attempts,
          },
          data: { attempts: { increment: 1 } },
        });
        if (claimed.count === 0) continue;
        const attempts = delivery.attempts + 1;
        try {
          if (notification.user.active) {
            if (delivery.channel === NotificationChannel.EMAIL) {
              await this.mail.send({
                to: notification.user.email,
                subject: `ReciclaBairro — ${notification.title}`,
                text: `Olá, ${notification.user.name}!\n\n${notification.body}\n\nEquipe ReciclaBairro`,
              });
            } else {
              await this.push.send({
                tokens: notification.user.deviceTokens.map(
                  (item) => item.token,
                ),
                title: notification.title,
                body: notification.body,
                data: (notification.data ?? {}) as Record<string, unknown>,
              });
            }
          }
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: DeliveryStatus.ENVIADA, sentAt: new Date() },
          });
          sent += 1;
        } catch (error) {
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              lastError: String(error).slice(0, 500),
              status:
                attempts >= MAX_ATTEMPTS
                  ? DeliveryStatus.FALHOU
                  : DeliveryStatus.PENDENTE,
            },
          });
          this.logger.warn(
            `Falha no envio ${delivery.channel} (${attempts}/${MAX_ATTEMPTS}): ${String(error)}`,
          );
        }
      }
    } finally {
      if (!ids) this.dispatching = false;
    }
    return sent;
  }

  // ───────────── Caixa de notificações do usuário ─────────────

  async list(userId: string, query: PaginationQuery, unreadOnly: boolean) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { ...toPage(items, total, query), unreadCount };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      throw AppException.notFound(
        'NOTIFICATION_NOT_FOUND',
        'Notificação não encontrada.',
      );
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
