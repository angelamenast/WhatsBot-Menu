/** Configuración del adaptador de OpenAI leída del entorno. Nunca se loguea (incluye la clave). */
export interface OpenAiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** undefined = no se envía el parámetro y el modelo usa su valor por defecto. */
  temperature?: number;
}

export const DEFAULT_OPENAI_TIMEOUT_MS = 10_000;
export const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 500;

export class OpenAiConfigError extends Error {
  /** Solo el NOMBRE de la variable: nunca su valor (podría ser la clave). */
  constructor(readonly variable: string, reason: string) {
    super(`Configuración de OpenAI inválida: ${variable} ${reason}`);
    this.name = 'OpenAiConfigError';
  }
}

function required(read: (key: string) => string | undefined, key: string): string {
  const value = read(key)?.trim();
  if (!value) {
    throw new OpenAiConfigError(key, 'es obligatoria con LLM_PROVIDER=openai');
  }
  return value;
}

function positiveInteger(read: (key: string) => string | undefined, key: string, fallback: number): number {
  const raw = read(key)?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OpenAiConfigError(key, 'debe ser un entero positivo');
  }
  return parsed;
}

/**
 * Valida y normaliza OPENAI_*. Falla al arrancar (no en el primer mensaje de un cliente) si falta
 * la clave o el modelo. OPENAI_MODEL no tiene valor por defecto a propósito.
 */
export function readOpenAiConfig(read: (key: string) => string | undefined): OpenAiConfig {
  const rawTemperature = read('OPENAI_TEMPERATURE')?.trim();
  let temperature: number | undefined;

  if (rawTemperature) {
    temperature = Number(rawTemperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new OpenAiConfigError('OPENAI_TEMPERATURE', 'debe ser un número entre 0 y 2');
    }
  }

  return {
    apiKey: required(read, 'OPENAI_API_KEY'),
    model: required(read, 'OPENAI_MODEL'),
    timeoutMs: positiveInteger(read, 'OPENAI_TIMEOUT_MS', DEFAULT_OPENAI_TIMEOUT_MS),
    maxOutputTokens: positiveInteger(read, 'OPENAI_MAX_OUTPUT_TOKENS', DEFAULT_OPENAI_MAX_OUTPUT_TOKENS),
    temperature,
  };
}
