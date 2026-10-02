import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderNotFoundError } from '../../domain/errors/order.errors';
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
    const order = await this.orderRepository.findById(command.orderId);

    if (!order || order.businessId !== command.businessId) {
      throw new OrderNotFoundError(command.orderId);
    }

    order.confirm();

    await this.orderRepository.save(order);

    return order;
  }
}
