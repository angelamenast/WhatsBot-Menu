import type { OrderStatusChangedEvent } from '../../../../../shared/events/order-status-changed.event';

/**
 * Puerto de salida: avisa que el estado de un pedido cambió. Quien lo implemente
 * no debe esperar a los consumidores (fire-and-forget): un fallo al notificar
 * nunca debe afectar el cambio de estado ya persistido.
 */
export interface OrderEventsPort {
  publishStatusChanged(event: OrderStatusChangedEvent): void;
}

export const ORDER_EVENTS_PORT = Symbol('OrderEventsPort');
