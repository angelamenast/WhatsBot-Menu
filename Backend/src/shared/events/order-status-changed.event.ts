/**
 * Contrato del evento "el estado de un pedido cambió". Lo publica `orders` y lo
 * consume quien quiera reaccionar (hoy `whatsapp`, para avisar al cliente).
 * Vive en shared para que ninguno de los dos módulos importe al otro.
 *
 * Deliberadamente sin teléfono ni texto: el consumidor resuelve el número desde
 * la conversación y decide el mensaje, y así el evento no arrastra datos
 * personales por logs o listeners.
 */
export const ORDER_STATUS_CHANGED_EVENT = 'order.status_changed';

export interface OrderStatusChangedEvent {
  orderId: string;
  businessId: string;
  conversationId: string;
  status: 'CONFIRMED' | 'CANCELLED';
  total: number;
  occurredAt: Date;
}
