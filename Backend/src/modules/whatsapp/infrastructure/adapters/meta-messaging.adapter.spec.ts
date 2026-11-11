import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { MAX_MESSAGE_BODY_LENGTH, MetaMessagingAdapter } from './meta-messaging.adapter';
import { MetaGraphClient } from './meta-graph.client';
import {
  InvalidMessageBodyError,
  WhatsappProviderError,
  WhatsappProviderTimeoutError,
} from '../../domain/errors/whatsapp.errors';

describe('MetaMessagingAdapter', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let adapter: MetaMessagingAdapter;

  const params = { phoneNumberId: '106540352242922', to: '573001111111', body: 'Tu pedido está listo' };

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    adapter = new MetaMessagingAdapter(new MetaGraphClient({ apiVersion: 'v25.0', accessToken: 'token' }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('éxito: envía el texto al phone_number_id y devuelve el wamid como providerMessageId', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        messaging_product: 'whatsapp',
        contacts: [{ input: '573001111111', wa_id: '573001111111' }],
        messages: [{ id: 'wamid.HBgLNTczMDAx' }],
      }),
    );

    const result = await adapter.sendMessage(params);

    expect(result).toEqual({ providerMessageId: 'wamid.HBgLNTczMDAx', status: 'sent' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/106540352242922/messages');
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '573001111111',
      type: 'text',
      text: { body: 'Tu pedido está listo' },
    });
  });

  it('error de la API: propaga el error tipado del cliente', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: { message: 'Re-engagement message', code: 131047, fbtrace_id: 'T' } }, 400),
    );

    await expect(adapter.sendMessage(params)).rejects.toMatchObject({ providerCode: 131047 });
  });

  it('timeout: lanza WhatsappProviderTimeoutError', async () => {
    fetchSpy.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));

    await expect(adapter.sendMessage(params)).rejects.toBeInstanceOf(WhatsappProviderTimeoutError);
  });

  it.each([
    ['sin messages', {}],
    ['messages vacío', { messages: [] }],
    ['id no string', { messages: [{ id: 5 }] }],
  ])('respuesta 200 sin wamid (%s): lanza WhatsappProviderError', async (_label, body) => {
    fetchSpy.mockResolvedValue(jsonResponse(body));

    await expect(adapter.sendMessage(params)).rejects.toBeInstanceOf(WhatsappProviderError);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   \n'],
    ['más de 4096 caracteres', 'a'.repeat(MAX_MESSAGE_BODY_LENGTH + 1)],
  ])('cuerpo %s: lanza InvalidMessageBodyError sin llamar a la API', async (_label, body) => {
    await expect(adapter.sendMessage({ ...params, body })).rejects.toBeInstanceOf(InvalidMessageBodyError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un cuerpo de exactamente 4096 caracteres es válido', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.X' }] }));

    await expect(
      adapter.sendMessage({ ...params, body: 'a'.repeat(MAX_MESSAGE_BODY_LENGTH) }),
    ).resolves.toMatchObject({ providerMessageId: 'wamid.X' });
  });

  it('el phone_number_id se escapa en la URL', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.X' }] }));

    await adapter.sendMessage({ ...params, phoneNumberId: '1/../x?y' });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://graph.facebook.com/v25.0/1%2F..%2Fx%3Fy/messages');
  });
});
