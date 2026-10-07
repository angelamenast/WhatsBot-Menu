import { Inject, Injectable } from '@nestjs/common';
import type { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AGENT_CONFIG_REPOSITORY } from '../../domain/repositories/agent-config.repository';
import { AgentConfig } from '../../domain/entities/agent-config.entity';

@Injectable()
export class GetAgentConfigUseCase {
  constructor(
    @Inject(AGENT_CONFIG_REPOSITORY) private readonly agentConfigRepository: AgentConfigRepository,
  ) {}

  async execute(businessId: string): Promise<AgentConfig> {
    const existing = await this.agentConfigRepository.findByBusinessId(businessId);

    // No persiste nada: si el negocio nunca configuró su agente, se devuelve una
    // config vacía en memoria para que el dashboard tenga algo que mostrar/editar.
    return existing ?? AgentConfig.initialize(businessId);
  }
}