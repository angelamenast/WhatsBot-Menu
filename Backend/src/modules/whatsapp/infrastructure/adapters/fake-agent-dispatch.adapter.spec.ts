import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { FakeAgentDispatchProvider } from './fake-agent-dispatch.adapter';

const LEVELS = ['log', 'warn', 'error', 'debug', 'verbose'] as const;

function spyOnLogger() {
  const spies = LEVELS.map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
  );
  return () =>
    spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map(String).join(' '))
      .join('\n');
}

describe('FakeAgentDispatchProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responde con el texto simulado y loguea solo ids, sin número ni mensaje del cliente', async () => {
    const logged = spyOnLogger();

    const result = await new FakeAgentDispatchProvider().dispatch({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      customerNumber: '+573001112233',
      message: 'Quiero una hamburguesa',
    });

    expect(result.responseText).toEqual(expect.any(String));
    expect(logged()).toContain('business-1');
    expect(logged()).toContain('conversation-1');
    expect(logged()).not.toContain('+573001112233');
    expect(logged()).not.toContain('Quiero una hamburguesa');
  });
});
