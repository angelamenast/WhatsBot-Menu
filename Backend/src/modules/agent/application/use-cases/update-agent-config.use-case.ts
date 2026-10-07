import { Inject, Injectable } from '@nestjs/common';
import type { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AGENT_CONFIG_REPOSITORY } from '../../domain/repositories/agent-config.repository';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { UpdateAgentConfigCommand } from '../dto/update-agent-config.command';

@Injectable()
export class UpdateAgentConfigUseCase {
  constructor(
    @Inject(AGENT_CONFIG_REPOSITORY) private readonly agentConfigRepository: AgentConfigRepository,
  ) {}

  async execute(command: UpdateAgentConfigCommand): Promise<AgentConfig> {
    const existing = await this.agentConfigRepository.findByBusinessId(command.businessId);
    const config = existing ?? AgentConfig.initialize(command.businessId);

    config.updateDetails({
      personality: command.personality,
      tone: command.tone,
      welcomeMessage: command.welcomeMessage,
      businessHours: command.businessHours,
    });

    await this.agentConfigRepository.save(config);

    return config;
  }
}