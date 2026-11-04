import type { ProposedOrder } from '../ports/out/llm.port';
import type { ProductRef } from './system-prompt.builder';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Convierte los argumentos que el modelo mandó a `propose_order` en un pedido propuesto con ids
 * reales. Los argumentos son datos NO confiables aunque el esquema los restrinja (el modelo puede
 * alucinar): se ignora todo lo que no sea { ref conocida, quantity entera >= 1 }, las referencias
 * repetidas se suman y el modelo nunca aporta ids, precios ni totales. Devuelve null si no queda
 * ningún ítem válido. Qué se acepta realmente lo decide después el módulo orders.
 */
export function parseProposedOrder(args: unknown, productRefs: ProductRef[]): ProposedOrder | null {
  if (!isRecord(args) || !Array.isArray(args.items)) {
    return null;
  }

  const productIdByRef = new Map(productRefs.map((entry) => [entry.ref, entry.productId]));
  const quantityByProduct = new Map<string, number>();

  for (const raw of args.items) {
    if (!isRecord(raw) || typeof raw.ref !== 'string') {
      continue;
    }

    const quantity = raw.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      continue;
    }

    const productId = productIdByRef.get(raw.ref.trim().toUpperCase());
    if (productId === undefined) {
      continue;
    }

    quantityByProduct.set(productId, (quantityByProduct.get(productId) ?? 0) + quantity);
  }

  if (quantityByProduct.size === 0) {
    return null;
  }

  return {
    items: [...quantityByProduct].map(([productId, quantity]) => ({ productId, quantity })),
  };
}
