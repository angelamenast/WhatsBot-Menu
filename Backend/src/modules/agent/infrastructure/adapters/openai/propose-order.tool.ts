import {
  PRODUCT_REF_PATTERN,
  PROPOSE_ORDER_DESCRIPTION,
  PROPOSE_ORDER_PARAMETERS,
  PROPOSE_ORDER_TOOL_NAME,
} from '../../../application/prompt/propose-order.schema';
import type { OpenAiToolDefinition } from './openai-chat-client';

// Se reexportan porque los tests y consumidores de este archivo los importan de aquí.
export { PRODUCT_REF_PATTERN, PROPOSE_ORDER_TOOL_NAME };

/**
 * `propose_order` en el formato de Chat Completions de OpenAI. Modo estricto: el SDK instalado
 * expone `strict` en la definición de la función.
 */
export const PROPOSE_ORDER_TOOL: OpenAiToolDefinition = {
  type: 'function',
  function: {
    name: PROPOSE_ORDER_TOOL_NAME,
    description: PROPOSE_ORDER_DESCRIPTION,
    strict: true,
    parameters: PROPOSE_ORDER_PARAMETERS,
  },
};
