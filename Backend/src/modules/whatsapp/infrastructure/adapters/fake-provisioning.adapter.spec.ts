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
  const phoneNumberId = '106540352242922';

  const build = (forceFail: string) =>
    new FakeProvisioningProvider({
      get: () => forceFail,
    } as unknown as ConfigService);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('vinculación exitosa: devuelve un número visible de solo dígitos, estable por phone_number_id, y no loguea', async () => {
    const logged = spyOnLogger();

    const result = await build('false').link(phoneNumberId);
    const again = await build('false').link(phoneNumberId);
    const other = await build('false').link('999999999999999');

    expect(result.status).toBe('connected');
    const displayPhoneNumber = result.status === 'connected' ? result.displayPhoneNumber : '';
    expect(displayPhoneNumber).toMatch(/^\d{11}$/);
    expect(again).toEqual(result);
    expect(other).not.toEqual(result);
    expect(logged()).not.toContain(displayPhoneNumber);
    expect(logged()).not.toContain(phoneNumberId);
  });

  it('vinculación fallida: devuelve failed', async () => {
    const result = await build('true').link(phoneNumberId);

    expect(result).toEqual({ status: 'failed' });
  });
});
