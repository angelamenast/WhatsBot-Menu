import type { GenerateReplyParams } from '../../../application/ports/out/llm.port';
import {
  buildConversationTurns,
  MAX_CHAT_MESSAGE_LENGTH,
} from '../../../application/prompt/conversation-turns.builder';
import type { OpenAiChatMessage } from './openai-chat-client';

// Se reexporta porque los tests y consumidores de este archivo lo importan de aquí.
export { MAX_CHAT_MESSAGE_LENGTH };

/** system + historial + mensaje actual, en el formato de Chat Completions de OpenAI. */
export function buildChatMessages(
  systemPrompt: string,
  history: GenerateReplyParams['history'],
  customerMessage: string,
): OpenAiChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...buildConversationTurns(history, customerMessage),
  ];
}
