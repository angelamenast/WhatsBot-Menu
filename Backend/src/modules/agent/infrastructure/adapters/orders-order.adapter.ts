import { Injectable } from '@nestjs/common';
import {
  CreateOrderCommand,
  CreateOrderResult,
  OrderPort,
  RejectedOrderItem,
} from '../../application/ports/out/order.port';
import { CreateOrderUseCase } from '../../../orders/application/use-cases/create-order.use-case';
import { ConversationAlreadyHasOrderError } from '../../../orders/domain/errors/order.errors';

/**
 * Traduce entre el contrato de agent (OrderPort) y la API pública del módulo
 * orders (CreateOrderUseCase). Es el único punto donde agent conoce a orders.
 *
 * Solo traduce a un resultado de negocio ConversationAlreadyHasOrderError. Los demás errores
 * (EmptyOrderError, ConversationNotInBusinessError, fallos de infraestructura) se propagan sin
 * capturar: decidir qué hacer con ellos es de quien invoque el puerto.
 */
@Injectable()
export class OrdersOrderAdapter implements OrderPort {
  constructor(private readonly createOrderUseCase: CreateOrderUseCase) {}

  async createOrder(command: CreateOrderCommand): Promise<CreateOrderResult> {
    let result: Awaited<ReturnType<CreateOrderUseCase['execute']>>;

    try {
      result = await this.createOrderUseCase.execute({
        businessId: command.businessId,
        conversationId: command.conversationId,
        items: command.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });
    } catch (error) {
      if (error instanceof ConversationAlreadyHasOrderError) {
        return { kind: 'CONVERSATION_ALREADY_HAS_ORDER', orderId: error.orderId };
      }
      throw error;
    }

    const rejectedItems: RejectedOrderItem[] = result.rejectedItems.map((rejected) => ({
      productId: rejected.productId,
      reason: rejected.reason,
    }));

    if (!result.order) {
      return { kind: 'NO_VALID_ITEMS', rejectedItems };
    }

    return {
      kind: 'CREATED',
      orderId: result.order.id,
      total: result.order.total,
      items: result.order.items.map((item) => ({
        productId: item.productId,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      rejectedItems,
    };
  }
}
