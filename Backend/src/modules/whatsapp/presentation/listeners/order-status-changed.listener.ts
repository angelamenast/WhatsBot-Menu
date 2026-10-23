import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_STATUS_CHANGED_EVENT } from '../../../../shared/events/order-status-changed.event';
import type { OrderStatusChangedEvent } from '../../../../shared/events/order-status-changed.event';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { CloseConversationUseCase } from '../../application/use-cases/close-conversation.use-case';
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

  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly closeConversationUseCase: CloseConversationUseCase,
  ) {}

  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async handle(event: OrderStatusChangedEvent): Promise<void> {
    await this.notifyCustomer(event);

    // Al confirmar el pedido la conversación termina (el siguiente mensaje abre otra). Se cierra
    // aunque el aviso haya fallado, y al cancelar no se cierra: el cliente puede hacer otro pedido.
    if (event.status === 'CONFIRMED') {
      await this.closeConversation(event);
    }
  }

  private async notifyCustomer(event: OrderStatusChangedEvent): Promise<void> {
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

  private async closeConversation(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await this.closeConversationUseCase.execute(event.conversationId);
    } catch (error) {
      this.logger.error(
        `No se pudo cerrar la conversación ${event.conversationId} tras confirmar el pedido ${event.orderId} (negocio ${event.businessId}): ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }
}
