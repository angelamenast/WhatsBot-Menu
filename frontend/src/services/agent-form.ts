import type { Agent, AgentUpdate } from './platform';

export const AGENT_TEXT_MAX = 500; // Límite del backend para personality y los mensajes.
// businessHours no tiene esquema en el backend: el front usa { día: "texto libre" }.
export const DAYS: [key: string, label: string][] = [['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'], ['jueves', 'Jueves'], ['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo']];
export const HOURS_MAX_BYTES = 1000; // El bot solo lee los primeros 1000 caracteres (el backend acepta 4096).

// El idioma se guarda como prefijo de personality; cuenta dentro de los 500 caracteres.
export const personalityPrefix = (language: string) => 'Idioma de respuesta: ' + language + '.\n\n';
export const instructionsMax = (language: string) => AGENT_TEXT_MAX - personalityPrefix(language).length;
export function writePersonality(language: string, instructions: string): string | null {
  const text = instructions.trim();
  // Sin instrucciones y con el idioma por defecto no hay nada que guardar: null borra el valor.
  return !text && language === 'Español' ? null : personalityPrefix(language) + text;
}

// Para vaciar un campo se envía null, nunca "".
export const textOrNull = (value: string) => value.trim() || null;

export function readHours(value: Agent['businessHours']) {
  const known = new Set(DAYS.map(([key]) => key));
  const days: Record<string, string> = {}; const extra: Record<string, unknown> = {};
  for (const [key, text] of Object.entries(value ?? {})) {
    if (known.has(key) && typeof text === 'string') days[key] = text; else extra[key] = text;
  }
  return { days, extra };
}

// Conserva las claves que no son días (por si otro cliente las escribió).
export function writeHours(days: Record<string, string>, extra: Record<string, unknown> = {}): Agent['businessHours'] {
  const result: Record<string, unknown> = { ...extra };
  for (const [key] of DAYS) { const text = days[key]?.trim(); if (text) result[key] = text; }
  return Object.keys(result).length ? result as Record<string, string> : null;
}

export const hoursTooLong = (hours: Agent['businessHours']) => hours !== null && JSON.stringify(hours).length > HOURS_MAX_BYTES;

// Solo los campos que cambiaron: campo ausente = no tocar.
export function agentChanges(original: AgentUpdate, next: AgentUpdate): AgentUpdate {
  const changes: AgentUpdate = {};
  for (const key of Object.keys(next) as (keyof AgentUpdate)[]) {
    if (JSON.stringify(original[key] ?? null) !== JSON.stringify(next[key] ?? null)) (changes as Record<string, unknown>)[key] = next[key] ?? null;
  }
  return changes;
}
