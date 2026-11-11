// El texto vive en el dominio (lo usa AgentConfig.default); se reexporta para el caso de uso.
export { DEFAULT_UNAVAILABLE_MESSAGE } from '../../domain/constants/agent-defaults';

/** Respuesta cuando el LLM falla: el cliente siempre debe recibir algo. */
export const FALLBACK_RESPONSE_TEXT =
  'Estamos teniendo un inconveniente para responderte en este momento. Intenta de nuevo en unos minutos.';
