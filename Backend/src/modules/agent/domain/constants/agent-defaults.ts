// Textos por defecto del agente. Los usa AgentConfig.default (lo que ve el dashboard sin fila y lo
// que usa el bot), así que viven en el dominio y application los reexporta.

export const DEFAULT_WELCOME_MESSAGE = '¡Hola! Bienvenido, ¿en qué puedo ayudarte hoy?';

/** Respuesta cuando el dueño no configuró un mensaje de no disponibilidad propio. */
export const DEFAULT_UNAVAILABLE_MESSAGE =
  'Por ahora no podemos atenderte por este medio. Por favor intenta más tarde.';
