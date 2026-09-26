export interface AgentDispatchCommand {
  businessId: string;
  conversationId: string;
  customerNumber: string;
  message: string;
}

export interface AgentDispatchPort {
  dispatch(command: AgentDispatchCommand): Promise<void>;
}

export const AGENT_DISPATCH_PORT = Symbol('AgentDispatchPort');
