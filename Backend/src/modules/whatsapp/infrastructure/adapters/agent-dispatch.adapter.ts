import { Injectable } from '@nestjs/common';
import {
  AgentDispatchCommand,
  AgentDispatchPort,
  AgentDispatchResult,
} from '../../application/ports/out/agent-dispatch.port';
import { ProcessCustomerMessageUseCase } from '../../../agent/application/use-cases/process-customer-message.use-case';

/**
 * Traduce entre el contrato de whatsapp (AgentDispatchPort) y la API pública del módulo
 * agent (ProcessCustomerMessageUseCase). Es el único punto donde whatsapp conoce a agent.
 */
@Injectable()
export class AgentDispatchAdapter implements AgentDispatchPort {
  constructor(private readonly processCustomerMessageUseCase: ProcessCustomerMessageUseCase) {}

  async dispatch(command: AgentDispatchCommand): Promise<AgentDispatchResult> {
    const result = await this.processCustomerMessageUseCase.execute({
      businessId: command.businessId,
      conversationId: command.conversationId,
      customerNumber: command.customerNumber,
      message: command.message,
    });

    return { responseText: result.responseText };
  }
}
