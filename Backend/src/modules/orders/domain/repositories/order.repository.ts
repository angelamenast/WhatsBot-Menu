import { Order } from '../entities/order.entity';

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findAllByBusinessId(businessId: string): Promise<Order[]>;
  save(order: Order): Promise<void>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
