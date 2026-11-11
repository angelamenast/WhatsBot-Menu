import { Inject, Injectable } from '@nestjs/common';
import type {
  OrderRepository,
  OrderView,
} from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { OrderNotFoundError } from '../../domain/errors/order.errors';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
  ) {}

  async execute(orderId: string, businessId: string): Promise<OrderView> {
    const view = await this.orderRepository.findViewById(orderId, businessId);

    if (!view) {
      throw new OrderNotFoundError(orderId);
    }

    return view;
  }
}
