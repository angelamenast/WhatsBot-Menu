/** Tono predefinido del agente (RF-22). El texto de prompt de cada valor vive en el adapter del LLM. */
export enum AgentTone {
  FORMAL = 'FORMAL',
  AMABLE = 'AMABLE',
  ENTUSIASTA = 'ENTUSIASTA',
  SEGURO = 'SEGURO',
  CERCANO = 'CERCANO',
}

/** Estilo regional del español colombiano que usa el agente. */
export enum AgentRegionalStyle {
  NEUTRO = 'NEUTRO',
  PAISA = 'PAISA',
  COSTENO = 'COSTENO',
  CALENO = 'CALENO',
  BOGOTANO = 'BOGOTANO',
}

// Único lugar donde se define qué significa "sin configurar" (null en la BD).
export const DEFAULT_AGENT_TONE = AgentTone.AMABLE;
export const DEFAULT_AGENT_REGIONAL_STYLE = AgentRegionalStyle.NEUTRO;

const TONES = new Set<string>(Object.values(AgentTone));
const REGIONAL_STYLES = new Set<string>(Object.values(AgentRegionalStyle));

/** Devuelve el valor si es un tono conocido; cualquier otra cosa da null (la lectura nunca falla). */
export function parseAgentTone(value: unknown): AgentTone | null {
  return typeof value === 'string' && TONES.has(value) ? (value as AgentTone) : null;
}

export function parseAgentRegionalStyle(value: unknown): AgentRegionalStyle | null {
  return typeof value === 'string' && REGIONAL_STYLES.has(value) ? (value as AgentRegionalStyle) : null;
}
