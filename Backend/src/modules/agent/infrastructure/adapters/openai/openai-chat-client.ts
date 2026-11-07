/**
 * Contrato mínimo que el adaptador necesita del cliente de OpenAI. Es propio (no el tipo del SDK)
 * para que los tests no carguen el SDK ni la red y para que un cambio del SDK solo toque el
 * factory que lo envuelve. Los nombres de campo son los de Chat Completions.
 */
export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface OpenAiChatRequest {
  model: string;
  messages: OpenAiChatMessage[];
  tools: OpenAiToolDefinition[];
  /** Tope de tokens de salida (`max_tokens` está deprecado en el SDK instalado). */
  max_completion_tokens: number;
  /** Solo se envía si OPENAI_TEMPERATURE está configurada. */
  temperature?: number;
}

export interface OpenAiToolCall {
  id: string;
  /** 'function' para herramientas de función; el SDK también puede devolver 'custom'. */
  type: string;
  function?: { name: string; arguments: string };
}

export interface OpenAiChatResponse {
  choices: {
    finish_reason: string;
    message: {
      content: string | null;
      refusal?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

export interface OpenAiChatClient {
  chat: {
    completions: {
      create(request: OpenAiChatRequest): Promise<OpenAiChatResponse>;
    };
  };
}
