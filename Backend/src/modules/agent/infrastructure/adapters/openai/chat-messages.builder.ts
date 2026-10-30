import type { GenerateReplyParams } from '../../../application/ports/out/llm.port';
import type { OpenAiChatMessage } from './openai-chat-client';
import { stripControlChars, truncateText } from './prompt-sanitizer';

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

const ROLE_BY_SENDER: Record<GenerateReplyParams['history'][number]['sender'], 'user' | 'assistant'> = {
  CUSTOMER: 'user',
  AGENT: 'assistant',
};

function clean(text: string): string {
  return truncateText(stripControlChars(text).trim(), MAX_CHAT_MESSAGE_LENGTH);
}

/**
 * system + historial (cliente → user, agente → assistant) + mensaje actual como `user`.
 * El texto del cliente y del historial NUNCA se concatena al system prompt: así sus órdenes
 * llegan al modelo como contenido de usuario y no con la autoridad de las instrucciones.
 * Cada mensaje se recorta a 1000 caracteres (también el actual).
 */
export function buildChatMessages(
  systemPrompt: string,
  history: GenerateReplyParams['history'],
  customerMessage: string,
): OpenAiChatMessage[] {
  const past: OpenAiChatMessage[] = history
    .map((message) => ({ role: ROLE_BY_SENDER[message.sender], content: clean(message.content) }))
    .filter((message) => message.content.length > 0);

  return [
    { role: 'system', content: systemPrompt },
    ...past,
    { role: 'user', content: clean(customerMessage) },
  ];
}
