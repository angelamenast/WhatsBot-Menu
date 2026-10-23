import { Conversation } from '../entities/conversation.entity';

export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findActiveByBusinessAndCustomer(businessId: string, customerNumber: string): Promise<Conversation | null>;
  /**
   * Upsert por id. Lanza ActiveConversationAlreadyExistsError si otra conversación activa del
   * mismo cliente y negocio ya existe (índice uq_conversaciones_activa).
   */
  save(conversation: Conversation): Promise<void>;
}

export const CONVERSATION_REPOSITORY = Symbol('ConversationRepository');
