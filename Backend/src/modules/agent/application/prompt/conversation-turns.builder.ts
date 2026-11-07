import type { GenerateReplyParams } from '../ports/out/llm.port';
import { stripControlChars, truncateText } from './prompt-sanitizer';

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

/** Un turno de la conversación en roles neutros; cada adaptador los traduce a los de su proveedor. */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const ROLE_BY_SENDER: Record<GenerateReplyParams['history'][number]['sender'], ConversationTurn['role']> = {
  CUSTOMER: 'user',
  AGENT: 'assistant',
};

function clean(text: string): string {
  return truncateText(stripControlChars(text).trim(), MAX_CHAT_MESSAGE_LENGTH);
}

/**
 * Historial (cliente → user, agente → assistant) seguido del mensaje actual como `user`. El texto
 * del cliente y del historial NUNCA se concatena al system prompt: así sus órdenes llegan al
 * modelo como contenido de usuario y no con la autoridad de las instrucciones. Cada mensaje se
 * recorta a 1000 caracteres (también el actual) y los mensajes de historial vacíos se omiten.
 */
export function buildConversationTurns(
  history: GenerateReplyParams['history'],
  customerMessage: string,
): ConversationTurn[] {
  const past: ConversationTurn[] = history
    .map((message) => ({ role: ROLE_BY_SENDER[message.sender], content: clean(message.content) }))
    .filter((turn) => turn.content.length > 0);

  return [...past, { role: 'user', content: clean(customerMessage) }];
}
