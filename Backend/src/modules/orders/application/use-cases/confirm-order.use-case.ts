import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import {
  OrderNotFoundError,
  OrderStateConflictError,
} from '../../domain/errors/order.errors';
import { UpdateOrderStatusCommand } from '../dto/update-order-status.command';

/**
 * Confirmar es decisión exclusiva del dueño del negocio desde el dashboard —
 * nunca del agente ni del cliente final. Solo es válido sobre un pedido
 * PENDING; si no lo está, Order.confirm() lanza InvalidOrderTransitionError
 * y este caso de uso simplemente deja que se propague (el controller la
 * traduce a un 409).
 */
@Injectable()
export class ConfirmOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
  ) {}

  async execute(command: UpdateOrderStatusCommand): Promise<Order> {
    const order = await this.orderRepository.findById(
      command.orderId,
      command.businessId,
    );

    if (!order) {
      throw new OrderNotFoundError(command.orderId);
    }

    const expectedStatus = order.status;
    order.confirm();

    // Compare-and-set: solo escribe si el pedido sigue en el estado que leímos.
    // Si otro proceso lo cambió entre el findById y aquí, no se pisa su cambio.
    const updated = await this.orderRepository.updateStatus(
      order.id,
      command.businessId,
      expectedStatus,
      order.status,
      order.updatedAt,
    );

    if (!updated) {
      throw new OrderStateConflictError(order.id);
    }

    return order;
  }
}
