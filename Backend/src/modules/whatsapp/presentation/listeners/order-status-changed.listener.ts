import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_STATUS_CHANGED_EVENT } from '../../../../shared/events/order-status-changed.event';
import type { OrderStatusChangedEvent } from '../../../../shared/events/order-status-changed.event';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import {
  orderCancelledMessage,
  orderConfirmedMessage,
} from '../../application/messages/order-notification.messages';

/**
 * Avisa por WhatsApp al cliente cuando el negocio confirma o cancela su pedido.
 * `whatsapp` solo conoce el contrato del evento (shared), no al módulo orders.
 *
 * Es un efecto secundario del cambio de estado: cualquier error se registra
 * (solo con ids) y NO se propaga, para no afectar a quien publicó el evento.
 */
@Injectable()
export class OrderStatusChangedListener {
  private readonly logger = new Logger(OrderStatusChangedListener.name);

  constructor(private readonly sendMessageUseCase: SendMessageUseCase) {}

  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async handle(event: OrderStatusChangedEvent): Promise<void> {
    try {
      const body =
        event.status === 'CONFIRMED'
          ? orderConfirmedMessage(event)
          : orderCancelledMessage(event);

      // El número del cliente lo resuelve SendMessageUseCase desde la conversación.
      await this.sendMessageUseCase.execute({
        conversationId: event.conversationId,
        body,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo notificar el pedido ${event.orderId} ${event.status} (negocio ${event.businessId}, conversación ${event.conversationId}): ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }
}
