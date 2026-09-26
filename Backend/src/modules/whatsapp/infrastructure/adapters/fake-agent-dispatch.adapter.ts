import { Injectable, Logger } from '@nestjs/common';
import { AgentDispatchCommand, AgentDispatchPort } from '../../application/ports/out/agent-dispatch.port';

@Injectable()
export class FakeAgentDispatchProvider implements AgentDispatchPort {
  private readonly logger = new Logger(FakeAgentDispatchProvider.name);

  async dispatch(command: AgentDispatchCommand): Promise<void> {
    this.logger.log(`[FakeAgentDispatchProvider] Comando recibido: ${JSON.stringify(command)}`);
  }
}
