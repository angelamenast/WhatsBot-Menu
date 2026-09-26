import { Conversation } from '../entities/conversation.entity';

export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findActiveByBusinessAndCustomer(businessId: string, customerNumber: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
}

export const CONVERSATION_REPOSITORY = Symbol('ConversationRepository');
