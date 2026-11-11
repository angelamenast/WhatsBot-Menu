import { Message } from '../entities/message.entity';

export interface MessageRepository {
  save(message: Message): Promise<void>;
  findByProviderMessageId(providerMessageId: string): Promise<Message | null>;
  /** Fecha del mensaje más reciente de la conversación (cualquier remitente), o null si no tiene mensajes. */
  findLastMessageDate(conversationId: string): Promise<Date | null>;
}

export const MESSAGE_REPOSITORY = Symbol('MessageRepository');
