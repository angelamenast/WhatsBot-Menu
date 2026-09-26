import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MessageRepository } from '../../domain/repositories/message.repository';
import { MESSAGE_REPOSITORY } from '../../domain/repositories/message.repository';
import type { MessageDeliveryStatus } from '../../domain/entities/message.entity';
import type { HandleStatusCallbackCommand, TwilioMessageStatus } from '../dto/handle-status-callback.command';

// Twilio distingue 'sent' de 'delivered' (y 'failed' de 'undelivered'), pero el dominio
// solo rastrea 'sent'|'failed'|'pending' (así está definido mensajes.estado_envio en BD).
// 'delivered' se colapsa a 'sent' y 'undelivered' a 'failed': ambos son, a efectos del
// dominio, la misma conclusión (se entregó / no se pudo entregar).
const TWILIO_STATUS_TO_DELIVERY_STATUS: Record<TwilioMessageStatus, MessageDeliveryStatus> = {
  sent: 'sent',
  delivered: 'sent',
  failed: 'failed',
  undelivered: 'failed',
};

@Injectable()
export class HandleStatusCallbackUseCase {
  private readonly logger = new Logger(HandleStatusCallbackUseCase.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository,
  ) {}

  async execute(command: HandleStatusCallbackCommand): Promise<void> {
    const deliveryStatus = TWILIO_STATUS_TO_DELIVERY_STATUS[command.status];

    if (!deliveryStatus) {
      this.logger.warn(
        `Status de Twilio no reconocido "${command.status}" para el mensaje ${command.providerMessageId}: se ignora`,
      );
      return;
    }

    const message = await this.messageRepository.findByProviderMessageId(command.providerMessageId);

    if (!message) {
      this.logger.warn(
        `No se encontró ningún mensaje con providerMessageId=${command.providerMessageId} (callback de status "${command.status}")`,
      );
      return;
    }

    message.updateDeliveryStatus(deliveryStatus);

    await this.messageRepository.save(message);
  }
}
