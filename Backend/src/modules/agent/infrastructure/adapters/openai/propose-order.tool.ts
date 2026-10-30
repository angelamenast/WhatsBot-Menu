import type { OpenAiToolDefinition } from './openai-chat-client';

export const PROPOSE_ORDER_TOOL_NAME = 'propose_order';

/** Las referencias de producto que ve el modelo: P1, P2… (nunca ids reales). */
export const PRODUCT_REF_PATTERN = String.raw`^P\d+$`;

/**
 * Herramienta con la que el modelo PROPONE un pedido. El modelo solo manda referencias y
 * cantidades; precios, totales e ids los pone el backend. Modo estricto: el SDK instalado
 * expone `strict` en la definición de la función.
 */
export const PROPOSE_ORDER_TOOL: OpenAiToolDefinition = {
  type: 'function',
  function: {
    name: PROPOSE_ORDER_TOOL_NAME,
    description:
      'Registra el pedido del cliente. Úsala SOLO cuando el cliente haya confirmado de forma explícita la lista final con cantidades (por ejemplo "sí, confírmalo"). No la uses para consultas, para cotizar ni para pedidos que el cliente aún está armando. Nunca incluyas productos agotados.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          description: 'Productos del pedido, con la referencia (P1, P2…) y la cantidad confirmada.',
          items: {
            type: 'object',
            properties: {
              ref: {
                type: 'string',
                pattern: PRODUCT_REF_PATTERN,
                description: 'Referencia del producto en el catálogo, por ejemplo P3.',
              },
              quantity: { type: 'integer', minimum: 1, description: 'Unidades confirmadas por el cliente.' },
            },
            required: ['ref', 'quantity'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
};
