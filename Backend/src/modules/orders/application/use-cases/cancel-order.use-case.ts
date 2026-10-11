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
 * Un pedido nace siempre PENDING (lo crea el agente cuando el cliente termina
 * de armarlo — ver CreateOrderUseCase). Cancelar es decisión exclusiva del
 * dueño del negocio desde el dashboard, válida tanto desde PENDING como desde
 * CONFIRMED (ver ConfirmOrderUseCase para la otra transición posible).
 */
@Injectable()
export class CancelOrderUseCase {
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
    order.cancel();

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
