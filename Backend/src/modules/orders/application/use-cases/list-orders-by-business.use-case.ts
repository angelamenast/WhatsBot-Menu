import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';

@Injectable()
export class ListOrdersByBusinessUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository) {}

  async execute(businessId: string): Promise<Order[]> {
    return this.orderRepository.findAllByBusinessId(businessId);
  }
}