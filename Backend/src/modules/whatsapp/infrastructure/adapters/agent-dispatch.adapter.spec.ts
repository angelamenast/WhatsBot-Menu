import { AgentDispatchAdapter } from './agent-dispatch.adapter';
import { ProcessCustomerMessageUseCase } from '../../../agent/application/use-cases/process-customer-message.use-case';

describe('AgentDispatchAdapter', () => {
  let processCustomerMessageUseCase: { execute: jest.Mock };
  let adapter: AgentDispatchAdapter;

  const command = {
    businessId: 'business-1',
    conversationId: 'conversation-1',
    customerNumber: '+573001111111',
    message: 'Hola',
  };

  beforeEach(() => {
    processCustomerMessageUseCase = { execute: jest.fn() };
    adapter = new AgentDispatchAdapter(
      processCustomerMessageUseCase as unknown as ProcessCustomerMessageUseCase,
    );
  });

  it('traduce el comando hacia agent y el resultado de vuelta al contrato de whatsapp', async () => {
    processCustomerMessageUseCase.execute.mockResolvedValue({ responseText: 'Hola, ¿en qué te ayudo?' });

    const result = await adapter.dispatch(command);

    expect(processCustomerMessageUseCase.execute).toHaveBeenCalledWith({
      businessId: command.businessId,
      conversationId: command.conversationId,
      customerNumber: command.customerNumber,
      message: command.message,
    });
    expect(result).toEqual({ responseText: 'Hola, ¿en qué te ayudo?' });
  });

  it('propaga los errores de agent sin tragarlos (el manejo es de quien despacha)', async () => {
    processCustomerMessageUseCase.execute.mockRejectedValue(new Error('agent falló'));

    await expect(adapter.dispatch(command)).rejects.toThrow('agent falló');
  });
});
