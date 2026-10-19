import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeProvisioningProvider } from './fake-provisioning.adapter';

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

describe('FakeProvisioningProvider', () => {
  const phoneNumber = '+573009998877';

  const build = (forceFail: string) =>
    new FakeProvisioningProvider({
      get: () => forceFail,
    } as unknown as ConfigService);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aprovisionamiento exitoso: devuelve los SIDs y no loguea el número', async () => {
    const logged = spyOnLogger();

    const result = await build('false').provision(phoneNumber);

    expect(result.status).toBe('connected');
    expect(logged()).not.toContain(phoneNumber);
  });

  it('aprovisionamiento fallido: devuelve failed y no loguea el número', async () => {
    const logged = spyOnLogger();

    const result = await build('true').provision(phoneNumber);

    expect(result).toEqual({ status: 'failed' });
    expect(logged()).not.toContain(phoneNumber);
  });
});
