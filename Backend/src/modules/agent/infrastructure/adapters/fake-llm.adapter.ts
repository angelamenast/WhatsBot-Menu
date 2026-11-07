import { Injectable, Logger } from '@nestjs/common';
import {
  GenerateReplyParams,
  GenerateReplyResult,
  LlmPort,
  ProposedOrder,
} from '../../application/ports/out/llm.port';

// "pedido 1x2 3x1": cada par NxM es el producto en la posición N (base 1) del catálogo recibido, M unidades.
const ORDER_MESSAGE_PATTERN = /^\s*pedido\s+((\d+)x(\d+)\s*)+$/i;
const ORDER_PAIR_PATTERN = /(\d+)x(\d+)/gi;

/**
 * LLM de mentira, SOLO para pruebas locales. Responde con un eco y, si el mensaje tiene la forma
 * "pedido 1x2 3x1", propone un pedido a partir de las posiciones del catálogo recibido: así se
 * puede ejercitar de punta a punta la creación de pedidos sin un modelo real.
 */
@Injectable()
export class FakeLlmProvider implements LlmPort {
  private readonly logger = new Logger(FakeLlmProvider.name);

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    this.logger.log(
      `[FakeLlmProvider] catálogo: ${params.catalog.length} items | historial: ${params.history.length} mensajes`,
    );

    const text = `(respuesta simulada) Recibí tu mensaje: "${params.customerMessage}". Tenemos ${params.catalog.filter((item) => item.available).length} productos disponibles.`;

    return {
      text,
      proposedOrder: this.proposeOrder(params),
      tokensInput: Math.ceil(params.customerMessage.length / 4),
      tokensOutput: Math.ceil(text.length / 4),
    };
  }

  private proposeOrder(params: GenerateReplyParams): ProposedOrder | null {
    if (!ORDER_MESSAGE_PATTERN.test(params.customerMessage)) {
      return null;
    }

    const items: ProposedOrder['items'] = [];

    for (const match of params.customerMessage.matchAll(ORDER_PAIR_PATTERN)) {
      const position = Number(match[1]);
      const quantity = Number(match[2]);
      const product = params.catalog[position - 1];

      // Posiciones fuera de rango (incluida la 0) se ignoran.
      if (position >= 1 && product) {
        items.push({ productId: product.id, quantity });
      }
    }

    return items.length > 0 ? { items } : null;
  }
}
