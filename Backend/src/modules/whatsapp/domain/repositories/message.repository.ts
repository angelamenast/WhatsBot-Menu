import { Message } from '../entities/message.entity';

export interface MessageRepository {
  save(message: Message): Promise<void>;
  findByProviderMessageId(providerMessageId: string): Promise<Message | null>;
}

export const MESSAGE_REPOSITORY = Symbol('MessageRepository');
