import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { FakeLlmProvider } from './fake-llm.adapter';

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

describe('FakeLlmProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('genera la respuesta simulada y NO loguea el mensaje del cliente', async () => {
    const logged = spyOnLogger();

    const result = await new FakeLlmProvider().generateReply({
      personality: null,
      tone: AgentTone.AMABLE,
      regionalStyle: AgentRegionalStyle.NEUTRO,
      catalog: [],
      history: [],
      customerMessage: 'Quiero una hamburguesa, mi número es 3001112233',
    });

    expect(result.text).toContain('Quiero una hamburguesa');
    expect(logged()).not.toContain('Quiero una hamburguesa');
    expect(logged()).not.toContain('3001112233');
  });
});
