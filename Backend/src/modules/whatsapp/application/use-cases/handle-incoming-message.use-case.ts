import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  ActiveConversationAlreadyExistsError,
  WhatsappConnectionNotFoundError,
} from '../../domain/errors/whatsapp.errors';
import { CONVERSATION_INACTIVITY_MS } from '../constants/conversation-lifecycle';
import { HandleIncomingMessageCommand } from '../dto/handle-incoming-message.command';
import { SendMessageUseCase } from './send-message.use-case';

@Injectable()
export class HandleIncomingMessageUseCase {
  private readonly logger = new Logger(HandleIncomingMessageUseCase.name);

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
    private readonly sendMessageUseCase: SendMessageUseCase,
  ) {}

  /** `now` es inyectable para probar el límite de inactividad sin esperar. */
  async execute(command: HandleIncomingMessageCommand, now: Date = new Date()): Promise<void> {
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

    // Una conversación inactiva se cierra aquí (una lectura por mensaje, sin escrituras extra
    // mientras siga vigente) y el mensaje entrante abre una nueva, sin historial previo.
    if (conversation && (await this.isInactive(conversation, now))) {
      conversation.close(now);
      await this.conversationRepository.save(conversation);
      conversation = null;
    }

    if (!conversation) {
      conversation = await this.startConversation(connection.businessId, command.fromCustomerNumber);
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

    // Desde aquí el mensaje ya está persistido: un fallo del agente o del envío se loguea
    // y no se propaga (el mensaje queda sin respuesta, igual que con plan vencido), para
    // que el webhook responda 200 y Twilio no reintente algo que la deduplicación cortaría.
    let responseText: string | null;

    try {
      responseText = await this.agentDispatchPort.dispatch({
        businessId: connection.businessId,
        conversationId: conversation.id,
        messageId: message.id,
        customerNumber: command.fromCustomerNumber,
        message: command.body,
      });
    } catch (error) {
      this.logger.error(
        `Fallo al despachar al agente (conversación ${conversation.id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    // null = el agente decidió no responder (p. ej. negocio inactivo o cuota agotada): no se envía nada.
    if (responseText === null) {
      return;
    }

    try {
      await this.sendMessageUseCase.execute({
        conversationId: conversation.id,
        body: responseText,
      });
    } catch (error) {
      this.logger.error(
        `Fallo al enviar la respuesta del agente (conversación ${conversation.id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Último mensaje de la conversación (o su creación si aún no tiene) con al menos 4 h de antigüedad. */
  private async isInactive(conversation: Conversation, now: Date): Promise<boolean> {
    const lastActivity =
      (await this.messageRepository.findLastMessageDate(conversation.id)) ?? conversation.createdAt;

    return now.getTime() - lastActivity.getTime() >= CONVERSATION_INACTIVITY_MS;
  }

  /**
   * Crea la conversación. Si dos mensajes del mismo cliente llegan a la vez, el segundo insert
   * viola uq_conversaciones_activa: se relee la activa que ganó la carrera y se sigue con ella.
   */
  private async startConversation(businessId: string, customerNumber: string): Promise<Conversation> {
    const conversation = Conversation.start({ businessId, customerNumber });

    try {
      await this.conversationRepository.save(conversation);
      return conversation;
    } catch (error) {
      if (!(error instanceof ActiveConversationAlreadyExistsError)) {
        throw error;
      }

      const existing = await this.conversationRepository.findActiveByBusinessAndCustomer(
        businessId,
        customerNumber,
      );

      if (!existing) {
        throw error;
      }

      return existing;
    }
  }
}
