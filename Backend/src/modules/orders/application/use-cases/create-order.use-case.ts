import { Inject, Injectable } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type { CatalogLookupRepository } from '../../domain/repositories/catalog-lookup.repository';
import { CATALOG_LOOKUP_REPOSITORY } from '../../domain/repositories/catalog-lookup.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { EmptyOrderError } from '../../domain/errors/order.errors';
import { CreateOrderCommand } from '../dto/create-order.command';
import type {
  CreateOrderResult,
  RejectedItem,
  RejectionReason,
} from '../dto/create-order.result';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
    @Inject(CATALOG_LOOKUP_REPOSITORY)
    private readonly catalogLookupRepository: CatalogLookupRepository,
  ) {}

  /**
   * Validación por ítem: los ítems inválidos no tumban el pedido, se devuelven
   * en `rejectedItems` y el pedido se crea solo con los válidos. Si ninguno lo
   * es, no se persiste nada y `order` es null. Una lista de entrada vacía sí es
   * una solicitud inválida y lanza EmptyOrderError.
   *
   * Nunca se confía en nombre/precio del invocador (ni siquiera existen en el
   * comando): siempre se relee la verdad actual del catálogo.
   */
  async execute(command: CreateOrderCommand): Promise<CreateOrderResult> {
    if (command.items.length === 0) {
      throw new EmptyOrderError();
    }

    const rejected = new Map<string, RejectedItem>();
    const reject = (productId: string, reason: RejectionReason) => {
      // Un mismo producto fallando por la misma razón se reporta una sola vez.
      const key = `${reason}|${productId.toLowerCase()}`;
      if (!rejected.has(key)) {
        rejected.set(key, { productId, reason });
      }
    };

    // Primero se valida cada línea por separado y recién después se fusiona:
    // una línea con cantidad inválida no contamina las válidas del mismo producto.
    // Map conserva el orden de primera aparición.
    const merged = new Map<
      string,
      { originalProductId: string; quantity: number }
    >();

    for (const line of command.items) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        reject(line.productId, 'INVALID_QUANTITY');
        continue;
      }
      // Un id que no es UUID no puede existir en el catálogo: ni siquiera se consulta.
      if (!UUID_PATTERN.test(line.productId)) {
        reject(line.productId, 'NOT_FOUND');
        continue;
      }

      // Minúsculas: Postgres devuelve los uuid en minúsculas y el cruce con la
      // respuesta del catálogo se hace por id.
      const key = line.productId.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        merged.set(key, {
          originalProductId: line.productId,
          quantity: line.quantity,
        });
      }
    }

    const orderItems: OrderItem[] = [];

    if (merged.size > 0) {
      const products = await this.catalogLookupRepository.findManyByIds(
        command.businessId,
        [...merged.keys()],
      );
      const productById = new Map(products.map((p) => [p.id.toLowerCase(), p]));

      for (const [key, line] of merged) {
        const product = productById.get(key);

        if (!product) {
          reject(line.originalProductId, 'NOT_FOUND');
          continue;
        }
        if (!product.available) {
          reject(line.originalProductId, 'UNAVAILABLE');
          continue;
        }

        orderItems.push(
          OrderItem.create({
            productId: product.id,
            productNameSnapshot: product.name,
            unitPrice: product.price,
            quantity: line.quantity,
          }),
        );
      }
    }

    const rejectedItems = [...rejected.values()];

    if (orderItems.length === 0) {
      return { order: null, rejectedItems };
    }

    const order = Order.createPending({
      businessId: command.businessId,
      conversationId: command.conversationId,
      items: orderItems,
    });

    await this.orderRepository.insert(order);

    return { order, rejectedItems };
  }
}
