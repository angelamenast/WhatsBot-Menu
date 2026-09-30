export class LlmGenerationError extends Error {
  constructor(reason: string) {
    super(`No se pudo generar una respuesta del agente: ${reason}`);
    this.name = 'LlmGenerationError';
  }
}

export class IncomingMessageNotPersistedError extends Error {
  constructor(conversationId: string) {
    super(
      `La conversación ${conversationId} no tiene mensajes: el mensaje entrante debe persistirse antes de invocar al agente`,
    );
    this.name = 'IncomingMessageNotPersistedError';
  }
}
