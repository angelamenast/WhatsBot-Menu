import type { Order, OrderStatus } from './platform';

export const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED'];
export const STATUS_LABELS: Record<OrderStatus, string> = { PENDING: 'Pendientes', CONFIRMED: 'Confirmados', CANCELLED: 'Cancelados' };

// Acciones válidas por estado (CANCELLED es final).
export function orderActions(status: OrderStatus): ('confirm' | 'cancel')[] {
  return status === 'PENDING' ? ['confirm', 'cancel'] : status === 'CONFIRMED' ? ['cancel'] : [];
}

// Misma referencia corta que ve el cliente en WhatsApp.
export const shortRef = (id: string) => id.slice(0, 8);

// confirm/cancel no devuelven customerPhone: se conserva el del GET previo.
export function mergeOrder(previous: Order | undefined, next: Order): Order {
  return { ...next, customerPhone: next.customerPhone ?? previous?.customerPhone };
}

// Día calendario en hora de Bogotá, en el formato YYYY-MM-DD que esperan from/to.
export function bogotaDate(date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function dateRangeError(from: string, to: string) {
  const format = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !format.test(from)) || (to && !format.test(to))) return 'Usa fechas con formato AAAA-MM-DD.';
  if (from && to && from > to) return 'La fecha inicial no puede ser posterior a la final.';
  return '';
}

export function matchesSearch(order: Order, query: string) {
  const text = [order.id, shortRef(order.id), order.customerPhone ?? '', ...order.items.map(item => item.productName)].join(' ').toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

// Ventas confirmadas de un día de Bogotá dentro de los pedidos cargados.
export function confirmedSales(orders: Order[], day: string) {
  return orders.filter(order => order.status === 'CONFIRMED' && bogotaDate(new Date(order.createdAt)) === day).reduce((sum, order) => sum + order.total, 0);
}

export const formatPhone = (phone?: string) => phone ? '+' + phone : 'Teléfono no disponible';

export const actionCopy = {
  confirm: { title: 'Confirmar pedido', accept: 'Confirmar', message: (ref: string) => `Se confirmará el pedido #${ref}. El cliente recibirá un aviso por WhatsApp y su conversación se cerrará.` },
  cancel: { title: 'Cancelar pedido', accept: 'Sí, cancelar', message: (ref: string) => `Se cancelará el pedido #${ref}. Esta acción es irreversible y el cliente recibirá un aviso por WhatsApp.` },
};
