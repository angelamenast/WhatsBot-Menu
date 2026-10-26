/**
 * Una conversación activa cuyo último mensaje tiene esta antigüedad (o más) se cierra al
 * llegar el siguiente mensaje del cliente, y ese mensaje abre una conversación nueva.
 */
export const CONVERSATION_INACTIVITY_MS = 4 * 60 * 60 * 1000;
