import type { PickupStatus } from '../generated/prisma/client.js';

/** Evento emitido a cada mudança em uma solicitação de retirada. */
export const PICKUP_EVENT = 'pickup.changed';

export type PickupEventKind =
  | 'CREATED'
  | 'REVIEW_STARTED'
  | 'SCHEDULED'
  | 'RESCHEDULED'
  | 'ASSIGNED'
  | 'REFUSED'
  | 'ROUTE_STARTED'
  | 'COMPLETED'
  | 'NOT_COLLECTED'
  | 'CANCELLED_BY_REQUESTER'
  | 'CANCELLED_BY_COOPERATIVE';

export interface PickupEvent {
  requestId: string;
  kind: PickupEventKind;
  from: PickupStatus | null;
  to: PickupStatus;
  authorId: string | null;
  comment?: string | null;
}
