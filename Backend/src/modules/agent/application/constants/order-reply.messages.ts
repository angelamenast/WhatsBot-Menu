import { formatCop, orderReference } from '../../../../shared/domain/order-display';
import type { AcceptedOrderItem, RejectedOrderItemReason } from '../ports/out/order.port';

/**
 * Textos que el BACKEND le envía al cliente cuando el agente registra (o no) un pedido. Son
 * funciones puras: el texto del modelo en ese turno se descarta, de modo que nada de lo que el
 * cliente lee sobre el pedido (referencia, total, ítems) lo escribe el modelo.
 */

/** Producto que no pudo entrar al pedido, ya con nombre resuelto contra el catálogo (null = desconocido). */
export interface RejectedProductLine {
  name: string | null;
  reason: RejectedOrderItemReason;
}

/** Cómo se nombra un producto que no está en el catálogo cargado. Nunca se repite el id ni lo que escribió el modelo. */
export const UNKNOWN_PRODUCT_LABEL = 'un producto que no está en el catálogo';

/** Respuesta fija cuando el puerto de pedidos falla por una razón técnica. */
export const ORDER_REGISTRATION_FAILED_TEXT =
  'No pude registrar tu pedido por un inconveniente técnico. Intenta de nuevo en unos minutos.';

const REJECTION_REASON_TEXT: Record<RejectedOrderItemReason, string> = {
  NOT_FOUND: 'no está en el catálogo',
  UNAVAILABLE: 'no está disponible por ahora',
  INVALID_QUANTITY: 'la cantidad no es válida',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rejectedLine(line: RejectedProductLine): string {
  // Un producto desconocido ya dice "no está en el catálogo": se evita repetir el motivo.
  if (line.name === null && line.reason === 'NOT_FOUND') {
    return `• ${capitalize(UNKNOWN_PRODUCT_LABEL)}`;
  }

  return `• ${line.name ?? capitalize(UNKNOWN_PRODUCT_LABEL)}: ${REJECTION_REASON_TEXT[line.reason]}`;
}

function rejectedSection(intro: string, rejected: RejectedProductLine[]): string[] {
  return rejected.length === 0 ? [] : ['', intro, ...rejected.map(rejectedLine)];
}

export function orderCreatedReply(data: {
  orderId: string;
  total: number;
  items: AcceptedOrderItem[];
  rejected: RejectedProductLine[];
}): string {
  return [
    `¡Listo! Registré tu pedido #${orderReference(data.orderId)} por ${formatCop(data.total)}:`,
    ...data.items.map((item) => `• ${item.name} × ${item.quantity}`),
    '',
    'El negocio lo revisará y lo confirmará. Te avisaremos por este chat.',
    ...rejectedSection('No pude agregar estos productos:', data.rejected),
  ].join('\n');
}

export function orderNotCreatedReply(data: { rejected: RejectedProductLine[] }): string {
  return [
    'No pude registrar tu pedido porque ninguno de los productos se pudo agregar:',
    ...data.rejected.map(rejectedLine),
    '',
    '¿Quieres elegir otros productos?',
  ].join('\n');
}

export function conversationAlreadyHasOrderReply(data: { orderId: string }): string {
  return `Ya tienes el pedido #${orderReference(data.orderId)} en revisión por el negocio. Te avisaremos por este chat cuando lo confirme.`;
}
