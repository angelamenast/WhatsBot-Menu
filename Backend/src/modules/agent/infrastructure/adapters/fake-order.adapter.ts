import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateOrderCommand, CreateOrderResult, OrderPort } from '../../application/ports/out/order.port';

@Injectable()
export class FakeOrderProvider implements OrderPort {
  private readonly logger = new Logger(FakeOrderProvider.name);

  async createOrder(command: CreateOrderCommand): Promise<CreateOrderResult> {
    this.logger.log(`[FakeOrderProvider] Pedido simulado: ${JSON.stringify(command)}`);
    return { orderId: randomUUID(), total: 0 };
  }
}