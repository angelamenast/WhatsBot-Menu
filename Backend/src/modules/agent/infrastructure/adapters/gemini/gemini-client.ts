/**
 * Contrato mínimo que el adaptador necesita del cliente de Gemini. Es propio (no el tipo del SDK)
 * para que los tests no carguen el SDK ni la red y para que un cambio del SDK solo toque el
 * factory que lo envuelve. Los nombres de campo son los de `models.generateContent`.
 */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  /** Esquema JSON de los parámetros (el SDK lo admite en `parametersJsonSchema`). */
  parametersJsonSchema: Record<string, unknown>;
}

export interface GeminiRequest {
  model: string;
  contents: GeminiContent[];
  config: {
    systemInstruction: string;
    tools: { functionDeclarations: GeminiFunctionDeclaration[] }[];
    maxOutputTokens: number;
    /** Valor del enum ThinkingLevel del SDK ('MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'). */
    thinkingConfig: { thinkingLevel: string };
    /** Corta la llamada al vencer el timeout. */
    abortSignal: AbortSignal;
  };
}

export interface GeminiResponsePart {
  text?: string;
  /** true en las partes de razonamiento: no son texto para el cliente. */
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: GeminiResponsePart[] } }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
}

export interface GeminiClient {
  models: {
    generateContent(request: GeminiRequest): Promise<GeminiResponse>;
  };
}
