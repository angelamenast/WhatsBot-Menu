export type HistorySender = 'CUSTOMER' | 'AGENT' | 'SYSTEM';

export interface HistoryMessage {
  sender: HistorySender;
  content: string;
  createdAt: Date;
}

/**
 * Puerto de solo lectura hacia `mensajes`. El módulo `whatsapp` es dueño del agregado
 * Message (con su propio estado_envio, etc.); `agent` solo necesita leer contenido y
 * remitente para dar contexto al LLM y para saber si es el primer mensaje de la
 * conversación (RF-10, mensaje de bienvenida). No se toca ni se reutiliza el
 * repositorio de `whatsapp`: cada módulo consulta la tabla compartida con la forma
 * que necesita, y la traducción columna->campo ocurre solo en su propio mapper.
 */
export interface ConversationHistoryRepository {
  countByConversationId(conversationId: string): Promise<number>;
  findRecentByConversationId(conversationId: string, limit: number): Promise<HistoryMessage[]>;
}

export const CONVERSATION_HISTORY_REPOSITORY = Symbol('ConversationHistoryRepository');