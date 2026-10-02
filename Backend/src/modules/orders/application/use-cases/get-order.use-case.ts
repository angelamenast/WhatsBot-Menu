import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderNotFoundError } from '../../domain/errors/order.errors';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
  ) {}

  async execute(orderId: string, businessId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);

    if (!order || order.businessId !== businessId) {
      throw new OrderNotFoundError(orderId);
    }

    return order;
  }
}