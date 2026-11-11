/**
 * Textos por defecto de las notificaciones de pedido al cliente. Un solo archivo
 * y una función por estado: cuando los mensajes sean configurables por negocio,
 * este es el único punto que cambia.
 */
import { formatCop, orderReference } from '../../../../shared/domain/order-display';

// orderReference vive en shared; se reexporta porque los tests y consumidores de este archivo lo importan de aquí.
export { orderReference };

export interface OrderNotificationData {
  orderId: string;
  total: number;
}

export function orderConfirmedMessage(data: OrderNotificationData): string {
  return `¡Tu pedido #${orderReference(data.orderId)} fue confirmado! Total: ${formatCop(data.total)}. Gracias por tu compra.`;
}

export function orderCancelledMessage(data: OrderNotificationData): string {
  return `Tu pedido #${orderReference(data.orderId)} fue cancelado por el negocio. Si tienes dudas, escríbenos por este chat.`;
}
