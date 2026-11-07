import { jest } from '@jest/globals';
import { createOpenAiChatClient } from './create-openai-chat-client';
import type { OpenAiChatRequest } from './openai-chat-client';

type AnyFn = (...args: any[]) => any;

describe('createOpenAiChatClient', () => {
  const config = {
    apiKey: 'clave-de-prueba-no-real',
    model: 'modelo',
    timeoutMs: 7000,
    maxOutputTokens: 500,
  };

  const request: OpenAiChatRequest = {
    model: 'modelo',
    messages: [{ role: 'user', content: 'hola' }],
    tools: [],
    max_completion_tokens: 500,
  };

  it('instancia el SDK con la clave, el timeout configurado y maxRetries: 0 (sin reintentos)', async () => {
    const constructed = jest.fn<AnyFn>();
    const create = jest.fn<AnyFn>().mockResolvedValue({ choices: [] });
    class FakeSdk {
      chat = { completions: { create } };
      constructor(options: unknown) {
        constructed(options);
      }
    }

    await createOpenAiChatClient(config, async () => ({ OpenAI: FakeSdk }));

    expect(constructed).toHaveBeenCalledWith({
      apiKey: 'clave-de-prueba-no-real',
      timeout: 7000,
      maxRetries: 0,
    });
  });

  it('delega create en el SDK con la petición tal cual', async () => {
    const create = jest.fn<AnyFn>().mockResolvedValue({ choices: [{ finish_reason: 'stop' }] });
    class FakeSdk {
      chat = { completions: { create } };
    }

    const client = await createOpenAiChatClient(config, async () => ({ default: FakeSdk }));
    const response = await client.chat.completions.create(request);

    expect(create).toHaveBeenCalledWith(request);
    expect(response.choices[0].finish_reason).toBe('stop');
  });

  it('si el módulo no exporta el cliente, lanza un error claro', async () => {
    await expect(createOpenAiChatClient(config, async () => ({}))).rejects.toThrow('openai');
  });
});
