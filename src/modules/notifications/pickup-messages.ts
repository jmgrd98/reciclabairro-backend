import { formatDateBr } from '../../common/dates.js';
import type { PickupEvent } from '../../common/events.js';
import type { Period } from '../../generated/prisma/client.js';

export interface PickupContext {
  id: string;
  protocol: string;
  requesterId: string;
  collectorId: string | null;
  cooperativeName: string | null;
  /** "YYYY-MM-DD" */
  scheduledDate: string | null;
  scheduledPeriod: Period | null;
  /** Gestores a avisar: os da cooperativa responsável ou, se ainda não há, os das cooperativas da região. */
  managerIds: string[];
}

export interface OutgoingNotification {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  /** Também enviar por e-mail (eventos mais importantes para o solicitante). */
  email: boolean;
  data: Record<string, string>;
}

const PERIOD_LABELS: Record<Period, string> = {
  MANHA: 'pela manhã',
  TARDE: 'à tarde',
  NOITE: 'à noite',
};

function when(context: PickupContext): string {
  if (!context.scheduledDate) return 'em data a confirmar';
  const period = context.scheduledPeriod
    ? `, ${PERIOD_LABELS[context.scheduledPeriod]}`
    : '';
  return `${formatDateBr(context.scheduledDate)}${period}`;
}

/**
 * Traduz um evento da solicitação nas mensagens que cada pessoa deve receber.
 * Linguagem simples e sempre dizendo o próximo passo (seção 5.4 do projeto).
 */
export function buildPickupNotifications(
  event: PickupEvent,
  context: PickupContext,
): OutgoingNotification[] {
  const data = { pickupRequestId: context.id, protocol: context.protocol };
  const cooperative = context.cooperativeName ?? 'a cooperativa';
  const reason = event.comment ? ` Motivo: ${event.comment}` : '';
  const toRequester = (
    title: string,
    body: string,
    email = false,
  ): OutgoingNotification => ({
    userIds: [context.requesterId],
    type: `PICKUP_${event.kind}`,
    title,
    body,
    email,
    data,
  });
  const toStaff = (
    userIds: (string | null)[],
    title: string,
    body: string,
  ): OutgoingNotification[] => {
    const ids = [
      ...new Set(userIds.filter((id): id is string => id !== null)),
    ].filter((id) => id !== event.authorId);
    return ids.length > 0
      ? [
          {
            userIds: ids,
            type: `PICKUP_${event.kind}`,
            title,
            body,
            email: false,
            data,
          },
        ]
      : [];
  };

  switch (event.kind) {
    case 'CREATED':
      return [
        toRequester(
          'Solicitação recebida',
          `Recebemos seu pedido de retirada ${context.protocol}. Avisaremos quando a cooperativa confirmar a data.`,
          true,
        ),
        ...toStaff(
          context.managerIds,
          'Nova solicitação de retirada',
          `O pedido ${context.protocol} aguarda análise.`,
        ),
      ];
    case 'REVIEW_STARTED':
      return [
        toRequester(
          'Pedido em análise',
          `${cooperative} está analisando seu pedido ${context.protocol}.`,
        ),
      ];
    case 'SCHEDULED':
      return [
        toRequester(
          'Coleta agendada',
          `Sua retirada ${context.protocol} foi confirmada para ${when(context)}. Deixe os materiais separados, limpos e secos.`,
          true,
        ),
        ...toStaff(
          [context.collectorId],
          'Nova coleta para você',
          `A coleta ${context.protocol} está agendada para ${when(context)}.`,
        ),
      ];
    case 'RESCHEDULED':
      return [
        toRequester(
          'Coleta reagendada',
          `Sua retirada ${context.protocol} mudou para ${when(context)}.${reason}`,
          true,
        ),
        ...toStaff(
          [context.collectorId],
          'Coleta reagendada',
          `A coleta ${context.protocol} mudou para ${when(context)}.`,
        ),
      ];
    case 'ASSIGNED':
      return toStaff(
        [context.collectorId],
        'Nova coleta para você',
        `A coleta ${context.protocol} está agendada para ${when(context)}.`,
      );
    case 'REFUSED':
      return [
        toRequester(
          'Pedido não aceito',
          `Não foi possível atender seu pedido ${context.protocol}.${reason} Você pode levar os materiais a um ponto de entrega: veja o mapa no aplicativo.`,
          true,
        ),
      ];
    case 'ROUTE_STARTED':
      return [
        toRequester(
          'Coletor a caminho',
          `O coletor saiu para buscar os materiais do pedido ${context.protocol}. Deixe tudo pronto para a retirada.`,
        ),
      ];
    case 'COMPLETED':
      return [
        toRequester(
          'Coleta concluída',
          `A retirada ${context.protocol} foi concluída. Obrigado por reciclar! Ela já está no seu histórico de descarte.`,
          true,
        ),
        ...toStaff(
          context.managerIds,
          'Coleta concluída',
          `A coleta ${context.protocol} foi concluída.`,
        ),
      ];
    case 'NOT_COLLECTED':
      return [
        toRequester(
          'Coleta não realizada',
          `Não conseguimos fazer a retirada ${context.protocol} hoje.${reason} A cooperativa vai informar uma nova data.`,
          true,
        ),
        ...toStaff(
          context.managerIds,
          'Coleta não realizada',
          `A coleta ${context.protocol} não foi realizada e precisa de nova data.${reason}`,
        ),
      ];
    case 'CANCELLED_BY_REQUESTER':
      return toStaff(
        [...context.managerIds, context.collectorId],
        'Pedido cancelado pelo solicitante',
        `O pedido ${context.protocol} foi cancelado.${reason}`,
      );
    case 'CANCELLED_BY_COOPERATIVE':
      return [
        toRequester(
          'Pedido cancelado',
          `${cooperative} cancelou a retirada ${context.protocol}.${reason}`,
          true,
        ),
        ...toStaff(
          [context.collectorId],
          'Coleta cancelada',
          `A coleta ${context.protocol} foi cancelada.`,
        ),
      ];
  }
}
