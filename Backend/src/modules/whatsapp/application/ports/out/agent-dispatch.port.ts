export interface AgentDispatchCommand {
  businessId: string;
  conversationId: string;
  /** Id del mensaje entrante ya persistido (agent lo excluye del historial y lo asocia al consumo). */
  messageId: string;
  customerNumber: string;
  message: string;
}

export interface AgentDispatchPort {
  /** Texto a enviar al cliente, o null si el agente decidió no responder (no se envía nada). */
  dispatch(command: AgentDispatchCommand): Promise<string | null>;
}

export const AGENT_DISPATCH_PORT = Symbol('AgentDispatchPort');
