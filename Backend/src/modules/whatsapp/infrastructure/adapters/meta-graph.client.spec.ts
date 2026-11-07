import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { MetaGraphClient } from './meta-graph.client';
import {
  MessagingWindowClosedError,
  WhatsappProviderAuthError,
  WhatsappProviderError,
  WhatsappProviderTimeoutError,
} from '../../domain/errors/whatsapp.errors';

describe('MetaGraphClient', () => {
  const accessToken = 'EAAB-token-super-secreto';
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let client: MetaGraphClient;

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rejection = (promise: Promise<unknown>): Promise<WhatsappProviderError> =>
    promise.then(
      () => {
        throw new Error('se esperaba un rechazo');
      },
      (error: unknown) => error as WhatsappProviderError,
    );

  const allLogged = () => errorSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    client = new MetaGraphClient({ apiVersion: 'v25.0', accessToken });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('éxito: POST a la URL versionada con Bearer, JSON y timeout de 10 s; devuelve el JSON', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    fetchSpy.mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.OK' }] }));

    const result = await client.request({ method: 'POST', path: '123/messages', body: { a: 1 } });

    expect(result).toEqual({ messages: [{ id: 'wamid.OK' }] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/123/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe('{"a":1}');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
  });

  it('GET: sin cuerpo ni Content-Type', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ display_phone_number: '+1 555' }));

    await client.request({ method: 'GET', path: '123?fields=display_phone_number' });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('error de la API: lanza WhatsappProviderError con code y fbtrace_id, y loguea code, message y fbtrace_id', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        { error: { message: '(#100) Invalid parameter', type: 'OAuthException', code: 100, fbtrace_id: 'AbC123' } },
        400,
      ),
    );

    const error = await rejection(client.request({ method: 'POST', path: '1/messages', body: {} }));

    expect(error).toBeInstanceOf(WhatsappProviderError);
    expect(error).not.toBeInstanceOf(WhatsappProviderAuthError);
    expect(error).toMatchObject({ providerCode: 100, traceId: 'AbC123' });
    expect(allLogged()).toContain('code=100');
    expect(allLogged()).toContain('(#100) Invalid parameter');
    expect(allLogged()).toContain('fbtrace_id=AbC123');
  });

  it('code 190: lanza WhatsappProviderAuthError', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: { message: 'Error validating access token', code: 190, fbtrace_id: 'T1' } }, 401),
    );

    await expect(client.request({ method: 'GET', path: '1' })).rejects.toBeInstanceOf(WhatsappProviderAuthError);
  });

  it('code 131047 (ventana de 24 h): lanza MessagingWindowClosedError', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: { message: 'Re-engagement message', code: 131047, fbtrace_id: 'T2' } }, 400),
    );

    const error = await rejection(client.request({ method: 'POST', path: '1/messages', body: {} }));

    expect(error).toBeInstanceOf(MessagingWindowClosedError);
    expect(error.providerCode).toBe(131047);
  });

  it('error con cuerpo no JSON o sin forma esperada: error genérico, sin lanzar por el parseo', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    fetchSpy.mockResolvedValueOnce(jsonResponse({ algo: 'raro' }, 500));

    const first = await rejection(client.request({ method: 'GET', path: '1' }));
    const second = await rejection(client.request({ method: 'GET', path: '1' }));

    for (const error of [first, second]) {
      expect(error).toBeInstanceOf(WhatsappProviderError);
      expect(error).toMatchObject({ providerCode: null, traceId: null });
    }
  });

  it('timeout: lanza WhatsappProviderTimeoutError', async () => {
    fetchSpy.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

    await expect(client.request({ method: 'GET', path: '1' })).rejects.toBeInstanceOf(
      WhatsappProviderTimeoutError,
    );
  });

  it('error de red: lanza WhatsappProviderError genérico sin reintentar', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const error = await rejection(client.request({ method: 'GET', path: '1' }));

    expect(error).toBeInstanceOf(WhatsappProviderError);
    expect(error).not.toBeInstanceOf(WhatsappProviderTimeoutError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('el token de acceso nunca aparece en logs ni en los mensajes de error', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Error validating access token', code: 190, fbtrace_id: 'T3' } }, 401),
    );
    fetchSpy.mockRejectedValueOnce(new TypeError(`fetch failed Bearer ${accessToken}`));
    fetchSpy.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));

    const errors: Error[] = [];
    for (let i = 0; i < 3; i++) {
      errors.push(await rejection(client.request({ method: 'GET', path: '1' })));
    }

    expect(allLogged()).not.toContain(accessToken);
    for (const error of errors) {
      expect(error.message).not.toContain(accessToken);
    }
  });
});
