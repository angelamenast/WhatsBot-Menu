import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MessageRepository } from '../../domain/repositories/message.repository';
import { MESSAGE_REPOSITORY } from '../../domain/repositories/message.repository';
import type { MessageDeliveryStatus } from '../../domain/entities/message.entity';
import type { HandleStatusCallbackCommand, ProviderMessageStatus } from '../dto/handle-status-callback.command';

// El dominio solo rastrea 'sent'|'failed'|'pending' (así está definido mensajes.estado_envio en BD).
// 'delivered' y 'read' son la misma conclusión que 'sent' a efectos del dominio: el mensaje salió
// y llegó. Los estados de la Graph API pueden llegar desordenados.
const PROVIDER_STATUS_TO_DELIVERY_STATUS: Record<ProviderMessageStatus, MessageDeliveryStatus> = {
  sent: 'sent',
  delivered: 'sent',
  read: 'sent',
  failed: 'failed',
};

@Injectable()
export class HandleStatusCallbackUseCase {
  private readonly logger = new Logger(HandleStatusCallbackUseCase.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository,
  ) {}

  async execute(command: HandleStatusCallbackCommand): Promise<void> {
    const deliveryStatus = PROVIDER_STATUS_TO_DELIVERY_STATUS[command.status];

    if (!deliveryStatus) {
      this.logger.warn(
        `Estado de entrega no reconocido "${command.status}" para el mensaje ${command.providerMessageId}: se ignora`,
      );
      return;
    }

    const message = await this.messageRepository.findByProviderMessageId(command.providerMessageId);

    if (!message) {
      this.logger.warn(
        `No se encontró ningún mensaje con providerMessageId=${command.providerMessageId} (estado "${command.status}")`,
      );
      return;
    }

    // No hay columna para el detalle del fallo: queda solo en el log.
    if (command.status === 'failed') {
      this.logger.warn(
        `Entrega fallida del mensaje ${command.providerMessageId}: code=${command.error?.code ?? 'desconocido'} message=${
          command.error?.message ?? 'sin detalle'
        }`,
      );
    }

    // "failed" es terminal: un "sent" tardío (desordenado) no lo pisa.
    if (message.deliveryStatus === 'failed' && deliveryStatus === 'sent') {
      return;
    }

    if (message.deliveryStatus === deliveryStatus) {
      return;
    }

    message.updateDeliveryStatus(deliveryStatus);

    await this.messageRepository.save(message);
  }
}
