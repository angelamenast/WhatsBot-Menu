import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderNotFoundError } from '../../domain/errors/order.errors';
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
    const order = await this.orderRepository.findById(command.orderId);

    if (!order || order.businessId !== command.businessId) {
      throw new OrderNotFoundError(command.orderId);
    }

    order.cancel();

    await this.orderRepository.save(order);

    return order;
  }
}
