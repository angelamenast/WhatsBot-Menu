import { Inject, Injectable } from '@nestjs/common';
import type { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../domain/repositories/whatsapp-connection.repository';
import type { ProcessedMessageRepository } from '../../domain/repositories/processed-message.repository';
import { PROCESSED_MESSAGE_REPOSITORY } from '../../domain/repositories/processed-message.repository';
import type { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { CONVERSATION_REPOSITORY } from '../../domain/repositories/conversation.repository';
import type { MessageRepository } from '../../domain/repositories/message.repository';
import { MESSAGE_REPOSITORY } from '../../domain/repositories/message.repository';
import type { PlanStatusPort } from '../ports/out/plan-status.port';
import { PLAN_STATUS_PORT } from '../ports/out/plan-status.port';
import type { AgentDispatchPort } from '../ports/out/agent-dispatch.port';
import { AGENT_DISPATCH_PORT } from '../ports/out/agent-dispatch.port';
import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';
import { HandleIncomingMessageCommand } from '../dto/handle-incoming-message.command';

@Injectable()
export class HandleIncomingMessageUseCase {
  constructor(
    @Inject(WHATSAPP_CONNECTION_REPOSITORY)
    private readonly whatsappConnectionRepository: WhatsappConnectionRepository,
    @Inject(PROCESSED_MESSAGE_REPOSITORY)
    private readonly processedMessageRepository: ProcessedMessageRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: MessageRepository,
    @Inject(PLAN_STATUS_PORT)
    private readonly planStatusPort: PlanStatusPort,
    @Inject(AGENT_DISPATCH_PORT)
    private readonly agentDispatchPort: AgentDispatchPort,
  ) {}

  async execute(command: HandleIncomingMessageCommand): Promise<void> {
    // Duplicado (reintento de Twilio): no volver a tocar conversación/mensaje/agente.
    const alreadyProcessed = await this.processedMessageRepository.existsByProviderMessageId(
      command.providerMessageId,
    );

    if (alreadyProcessed) {
      return;
    }

    const connection = await this.whatsappConnectionRepository.findByPhoneNumber(command.toPhoneNumber);

    if (!connection) {
      throw new WhatsappConnectionNotFoundError(command.toPhoneNumber);
    }

    let conversation = await this.conversationRepository.findActiveByBusinessAndCustomer(
      connection.businessId,
      command.fromCustomerNumber,
    );

    if (!conversation) {
      conversation = Conversation.start({
        businessId: connection.businessId,
        customerNumber: command.fromCustomerNumber,
      });
      await this.conversationRepository.save(conversation);
    }

    const message = Message.receiveFromCustomer({
      conversationId: conversation.id,
      content: command.body,
      providerMessageId: command.providerMessageId,
    });

    await this.messageRepository.save(message);

    // RF-25: el mensaje se registra siempre; el agente solo responde con plan activo.
    const isPlanActive = await this.planStatusPort.isActive(connection.businessId);

    if (!isPlanActive) {
      return;
    }

    await this.agentDispatchPort.dispatch({
      businessId: connection.businessId,
      conversationId: conversation.id,
      customerNumber: command.fromCustomerNumber,
      message: command.body,
    });
  }
}
