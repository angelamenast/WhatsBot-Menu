import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type { CatalogLookupRepository } from '../../domain/repositories/catalog-lookup.repository';
import { CATALOG_LOOKUP_REPOSITORY } from '../../domain/repositories/catalog-lookup.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import {
  EmptyOrderError,
  ProductNotFoundError,
  ProductUnavailableError,
} from '../../domain/errors/order.errors';
import { CreateOrderCommand } from '../dto/create-order.command';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
    @Inject(CATALOG_LOOKUP_REPOSITORY)
    private readonly catalogLookupRepository: CatalogLookupRepository,
  ) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    if (command.items.length === 0) {
      throw new EmptyOrderError();
    }

    const productIds = command.items.map((item) => item.productId);
    const products = await this.catalogLookupRepository.findManyByIds(
      command.businessId,
      productIds,
    );
    const productById = new Map(products.map((p) => [p.id, p]));

    // Nunca se confía en nombre/precio que venga del invocador (agent u otro):
    // siempre se relee la verdad actual del catálogo, ítem por ítem.
    const orderItems = command.items.map((item) => {
      const product = productById.get(item.productId);

      if (!product) {
        throw new ProductNotFoundError(item.productId);
      }
      if (!product.available) {
        throw new ProductUnavailableError(item.productId);
      }

      return OrderItem.create({
        productId: product.id,
        productNameSnapshot: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
      });
    });

    const order = Order.createPending({
      businessId: command.businessId,
      conversationId: command.conversationId,
      items: orderItems,
    });

    await this.orderRepository.save(order);

    return order;
  }
}
