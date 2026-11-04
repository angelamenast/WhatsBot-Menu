export const GEMINI_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVELS)[number];

/** Configuración del adaptador de Gemini leída del entorno. Nunca se loguea (incluye la clave). */
export interface GeminiConfig {
  apiKey: string;
  /** Modelo principal. */
  model: string;
  /** Modelo de respaldo (opcional): se usa cuando el principal sigue fallando con 503 o 429. */
  fallbackModel?: string;
  /** Presupuesto TOTAL de la llamada, reintentos y respaldo incluidos; cada intento recibe lo que reste. */
  timeoutMs: number;
  /** Tope de tokens de salida; en Gemini incluye los tokens de razonamiento. */
  maxOutputTokens: number;
  thinkingLevel: GeminiThinkingLevel;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
// Objetivo de latencia: menos de ~5 s por mensaje en total (reintento y respaldo incluidos).
export const DEFAULT_GEMINI_TIMEOUT_MS = 5_000;
// Más holgado que el de otros proveedores: el razonamiento también consume este presupuesto, y
// un tope justo dejaría respuestas cortadas (MAX_TOKENS) aunque el modelo piense poco.
export const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 1024;
export const DEFAULT_GEMINI_THINKING_LEVEL: GeminiThinkingLevel = 'low';

export class GeminiConfigError extends Error {
  /** Solo el NOMBRE de la variable: nunca su valor (podría ser la clave). */
  constructor(readonly variable: string, reason: string) {
    super(`Configuración de Gemini inválida: ${variable} ${reason}`);
    this.name = 'GeminiConfigError';
  }
}

type Read = (key: string) => string | undefined;

function positiveInteger(read: Read, key: string, fallback: number): number {
  const raw = read(key)?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new GeminiConfigError(key, 'debe ser un entero positivo');
  }
  return parsed;
}

/**
 * Valida y normaliza GEMINI_*. Falla al arrancar (no en el primer mensaje de un cliente) si falta
 * la clave. La clave NO se valida por formato: solo que exista.
 */
export function readGeminiConfig(read: Read): GeminiConfig {
  const apiKey = read('GEMINI_API_KEY')?.trim();
  if (!apiKey) {
    throw new GeminiConfigError('GEMINI_API_KEY', 'es obligatoria con LLM_PROVIDER=gemini');
  }

  const rawLevel = read('GEMINI_THINKING_LEVEL')?.trim().toLowerCase();
  let thinkingLevel = DEFAULT_GEMINI_THINKING_LEVEL;
  if (rawLevel) {
    if (!(GEMINI_THINKING_LEVELS as readonly string[]).includes(rawLevel)) {
      throw new GeminiConfigError('GEMINI_THINKING_LEVEL', `debe ser uno de: ${GEMINI_THINKING_LEVELS.join(', ')}`);
    }
    thinkingLevel = rawLevel as GeminiThinkingLevel;
  }

  return {
    apiKey,
    model: read('GEMINI_MODEL')?.trim() || DEFAULT_GEMINI_MODEL,
    fallbackModel: read('GEMINI_FALLBACK_MODEL')?.trim() || undefined,
    timeoutMs: positiveInteger(read, 'GEMINI_TIMEOUT_MS', DEFAULT_GEMINI_TIMEOUT_MS),
    maxOutputTokens: positiveInteger(read, 'GEMINI_MAX_OUTPUT_TOKENS', DEFAULT_GEMINI_MAX_OUTPUT_TOKENS),
    thinkingLevel,
  };
}
