export class LlmGenerationError extends Error {
  constructor(reason: string) {
    super(`No se pudo generar una respuesta del agente: ${reason}`);
    this.name = 'LlmGenerationError';
  }
}