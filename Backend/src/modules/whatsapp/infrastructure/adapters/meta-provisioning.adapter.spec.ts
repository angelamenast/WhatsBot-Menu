import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { MetaProvisioningAdapter } from './meta-provisioning.adapter';
import { MetaGraphClient } from './meta-graph.client';
import { WhatsappProviderError, WhatsappProviderTimeoutError } from '../../domain/errors/whatsapp.errors';

describe('MetaProvisioningAdapter', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let adapter: MetaProvisioningAdapter;

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    adapter = new MetaProvisioningAdapter(new MetaGraphClient({ apiVersion: 'v25.0', accessToken: 'token' }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('éxito: consulta display_phone_number y verified_name y devuelve el número visible', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ verified_name: 'Test Number', display_phone_number: '+1 555-025-3483', id: '106540352242922' }),
    );

    const result = await adapter.link('106540352242922');

    expect(result).toEqual({ status: 'connected', displayPhoneNumber: '+1 555-025-3483' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://graph.facebook.com/v25.0/106540352242922?fields=display_phone_number,verified_name',
    );
    expect(init.method).toBe('GET');
  });

  it.each([
    ['sin display_phone_number', { id: '1' }],
    ['display_phone_number sin dígitos', { display_phone_number: 'n/a' }],
    ['display_phone_number no string', { display_phone_number: 15550253483 }],
  ])('respuesta %s: devuelve failed', async (_label, body) => {
    fetchSpy.mockResolvedValue(jsonResponse(body));

    await expect(adapter.link('1')).resolves.toEqual({ status: 'failed' });
  });

  it('error de la API (p. ej. id inexistente): propaga el error tipado', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: { message: 'Unsupported get request', code: 100, fbtrace_id: 'T' } }, 400),
    );

    await expect(adapter.link('999')).rejects.toBeInstanceOf(WhatsappProviderError);
  });

  it('timeout: propaga WhatsappProviderTimeoutError', async () => {
    fetchSpy.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));

    await expect(adapter.link('1')).rejects.toBeInstanceOf(WhatsappProviderTimeoutError);
  });
});
