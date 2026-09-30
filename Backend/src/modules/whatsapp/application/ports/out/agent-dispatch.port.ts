export interface AgentDispatchCommand {
  businessId: string;
  conversationId: string;
  customerNumber: string;
  message: string;
}

export interface AgentDispatchResult {
  responseText: string;
}

export interface AgentDispatchPort {
  dispatch(command: AgentDispatchCommand): Promise<AgentDispatchResult>;
}

export const AGENT_DISPATCH_PORT = Symbol('AgentDispatchPort');
