import { Inject, Injectable } from '@nestjs/common';
import type { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { CONVERSATION_REPOSITORY } from '../../domain/repositories/conversation.repository';
import { ConversationStatus } from '../../domain/entities/conversation.entity';
import { ConversationNotFoundError } from '../../domain/errors/whatsapp.errors';

@Injectable()
export class CloseConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
  ) {}

  /**
   * Idempotente: cerrar una conversación ya cerrada no hace nada (no escribe). Lanza
   * ConversationNotFoundError si no existe.
   */
  async execute(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    if (conversation.status === ConversationStatus.CLOSED) {
      return;
    }

    conversation.close();
    await this.conversationRepository.save(conversation);
  }
}
