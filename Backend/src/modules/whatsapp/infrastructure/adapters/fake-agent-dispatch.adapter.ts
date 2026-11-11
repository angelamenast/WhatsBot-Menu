import { Injectable, Logger } from '@nestjs/common';
import { AgentDispatchCommand, AgentDispatchPort } from '../../application/ports/out/agent-dispatch.port';

@Injectable()
export class FakeAgentDispatchProvider implements AgentDispatchPort {
  private readonly logger = new Logger(FakeAgentDispatchProvider.name);

  async dispatch(command: AgentDispatchCommand): Promise<string | null> {
    this.logger.log(
      `[FakeAgentDispatchProvider] Comando recibido (negocio ${command.businessId}, conversación ${command.conversationId})`,
    );
    return 'Respuesta simulada del agente';
  }
}
