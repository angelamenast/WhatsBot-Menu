import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeMessagingProvider } from './fake-messaging.adapter';

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

describe('FakeMessagingProvider', () => {
  const to = '+573001112233';
  const body = 'Tu pedido #3f1c8a52 fue confirmado';

  const build = (forceFail: string) =>
    new FakeMessagingProvider({
      get: () => forceFail,
    } as unknown as ConfigService);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envío simulado exitoso: devuelve sent y loguea solo el providerMessageId', async () => {
    const logged = spyOnLogger();

    const result = await build('false').sendMessage(to, body);

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toEqual(expect.any(String));
    expect(logged()).toContain(result.providerMessageId as string);
    expect(logged()).not.toContain(to);
    expect(logged()).not.toContain(body);
  });

  it('envío simulado fallido: devuelve failed y NO loguea número ni cuerpo', async () => {
    const logged = spyOnLogger();

    const result = await build('true').sendMessage(to, body);

    expect(result).toEqual({ providerMessageId: null, status: 'failed' });
    expect(logged()).not.toContain(to);
    expect(logged()).not.toContain(body);
  });
});
