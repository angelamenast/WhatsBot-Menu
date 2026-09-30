import { AgentConfig } from '../entities/agent-config.entity';

export interface AgentConfigRepository {
  findByBusinessId(businessId: string): Promise<AgentConfig | null>;
  save(config: AgentConfig): Promise<void>;
}

export const AGENT_CONFIG_REPOSITORY = Symbol('AgentConfigRepository');