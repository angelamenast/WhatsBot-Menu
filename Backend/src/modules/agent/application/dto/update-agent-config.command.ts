import type { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';

export interface UpdateAgentConfigCommand {
  businessId: string;
  personality?: string | null;
  tone?: AgentTone | null;
  regionalStyle?: AgentRegionalStyle | null;
  welcomeMessage?: string | null;
  unavailableMessage?: string | null;
  businessHours?: Record<string, unknown> | null;
}