import { Injectable } from '@nestjs/common';
import {
  CreateOrderCommand,
  CreateOrderResult,
  OrderPort,
} from '../../application/ports/out/order.port';
import { CreateOrderUseCase } from '../../../orders/application/use-cases/create-order.use-case';

/**
 * Traduce entre el contrato de agent (OrderPort) y la API pública del módulo
 * orders (CreateOrderUseCase). Es el único punto donde agent conoce a orders.
 *
 * Los errores (EmptyOrderError, ConversationNotInBusinessError, fallos de
 * infraestructura) se propagan sin capturar: decidir qué hacer con ellos es de
 * quien invoque el puerto.
 */
@Injectable()
export class OrdersOrderAdapter implements OrderPort {
  constructor(private readonly createOrderUseCase: CreateOrderUseCase) {}

  async createOrder(command: CreateOrderCommand): Promise<CreateOrderResult> {
    const result = await this.createOrderUseCase.execute({
      businessId: command.businessId,
      conversationId: command.conversationId,
      items: command.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    return {
      orderId: result.order?.id ?? null,
      total: result.order?.total ?? null,
      rejectedItems: result.rejectedItems.map((rejected) => ({
        productId: rejected.productId,
        reason: rejected.reason,
      })),
    };
  }
}
