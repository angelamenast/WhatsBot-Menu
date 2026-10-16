/**
 * Textos por defecto de las notificaciones de pedido al cliente. Un solo archivo
 * y una función por estado: cuando los mensajes sean configurables por negocio,
 * este es el único punto que cambia.
 */
export interface OrderNotificationData {
  orderId: string;
  total: number;
}

const copFormat = (fractionDigits: 0 | 2) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const copWithoutDecimals = copFormat(0);
const copWithDecimals = copFormat(2);

/** Pesos enteros sin decimales ($ 36.000); con centavos, siempre dos ($ 15.000,50). */
function formatCop(total: number): string {
  return (Number.isInteger(total) ? copWithoutDecimals : copWithDecimals).format(total);
}

/** Referencia corta que ve el cliente: primeros 8 caracteres del UUID. */
export function orderReference(orderId: string): string {
  return orderId.slice(0, 8);
}

export function orderConfirmedMessage(data: OrderNotificationData): string {
  return `¡Tu pedido #${orderReference(data.orderId)} fue confirmado! Total: ${formatCop(data.total)}. Gracias por tu compra.`;
}

export function orderCancelledMessage(data: OrderNotificationData): string {
  return `Tu pedido #${orderReference(data.orderId)} fue cancelado por el negocio. Si tienes dudas, escríbenos por este chat.`;
}
