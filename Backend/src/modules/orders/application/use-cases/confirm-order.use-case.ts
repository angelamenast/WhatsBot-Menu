import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type { OrderEventsPort } from '../ports/out/order-events.port';
import { ORDER_EVENTS_PORT } from '../ports/out/order-events.port';
import { Order } from '../../domain/entities/order.entity';
import {
  OrderNotFoundError,
  OrderStateConflictError,
} from '../../domain/errors/order.errors';
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
  private readonly logger = new Logger(ConfirmOrderUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
    @Inject(ORDER_EVENTS_PORT) private readonly orderEvents: OrderEventsPort,
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
    order.confirm();

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

    this.notifyStatusChanged(order);

    return order;
  }

  /**
   * El estado ya quedó persistido: avisar al resto del sistema es un efecto
   * secundario. Si falla, solo se registra (con ids, sin datos del cliente) y
   * nunca se relanza ni se revierte el cambio.
   */
  private notifyStatusChanged(order: Order): void {
    try {
      this.orderEvents.publishStatusChanged({
        orderId: order.id,
        businessId: order.businessId,
        conversationId: order.conversationId,
        status: 'CONFIRMED',
        total: order.total,
        occurredAt: order.updatedAt,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo publicar el evento de pedido ${order.id} CONFIRMED (negocio ${order.businessId}): ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }
}
