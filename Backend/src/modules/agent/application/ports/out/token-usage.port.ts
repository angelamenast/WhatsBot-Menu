export interface RecordTokenUsageCommand {
  businessId: string;
  conversationId: string;
  messageId?: string;
  /** Modelo que generó la respuesta, si el proveedor lo informa. */
  model?: string;
  tokensInput: number;
  tokensOutput: number;
}

export interface TokenUsagePort {
  record(command: RecordTokenUsageCommand): Promise<void>;
}

export const TOKEN_USAGE_PORT = Symbol('TokenUsagePort');