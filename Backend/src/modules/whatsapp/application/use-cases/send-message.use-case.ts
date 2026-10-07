import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MessagingPort } from '../ports/out/messaging.port';
import { MESSAGING_PORT } from '../ports/out/messaging.port';
import type { MessageRepository } from '../../domain/repositories/message.repository';
import { MESSAGE_REPOSITORY } from '../../domain/repositories/message.repository';
import type { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { CONVERSATION_REPOSITORY } from '../../domain/repositories/conversation.repository';
import { Message } from '../../domain/entities/message.entity';
import type { MessageDeliveryStatus } from '../../domain/entities/message.entity';
import { ConversationNotFoundError } from '../../domain/errors/whatsapp.errors';
import { SendMessageCommand } from '../dto/send-message.command';

@Injectable()
export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    @Inject(MESSAGING_PORT) private readonly messagingPort: MessagingPort,
    @Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository,
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
  ) {}

  async execute(command: SendMessageCommand): Promise<void> {
    const conversation = await this.conversationRepository.findById(command.conversationId);

    if (!conversation) {
      throw new ConversationNotFoundError(command.conversationId);
    }

    const to = conversation.customerNumber;

    let providerMessageId: string | null = null;
    let deliveryStatus: MessageDeliveryStatus;

    try {
      const result = await this.messagingPort.sendMessage(to, command.body);
      providerMessageId = result.providerMessageId;
      deliveryStatus = result.status;
    } catch (error) {
      this.logger.error(
        `Fallo al enviar mensaje a ${to} (conversación ${command.conversationId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      deliveryStatus = 'failed';
    }

    const message = Message.sentByAgent({
      conversationId: command.conversationId,
      content: command.body,
      providerMessageId,
      deliveryStatus,
    });

    await this.messageRepository.save(message);
  }
}
