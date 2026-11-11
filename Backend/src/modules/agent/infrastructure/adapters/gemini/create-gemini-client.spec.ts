import { jest } from '@jest/globals';
import { createGeminiClient } from './create-gemini-client';
import type { GeminiRequest } from './gemini-client';

type AnyFn = (...args: any[]) => any;

describe('createGeminiClient', () => {
  it('instancia el SDK solo con la clave (endpoint nativo, sin reintentos configurados)', async () => {
    const constructed = jest.fn<AnyFn>();
    class FakeSdk {
      models = { generateContent: jest.fn<AnyFn>() };
      constructor(options: unknown) {
        constructed(options);
      }
    }

    await createGeminiClient({ apiKey: 'clave-de-prueba' }, async () => ({ GoogleGenAI: FakeSdk }));

    expect(constructed).toHaveBeenCalledTimes(1);
    expect(constructed).toHaveBeenCalledWith({ apiKey: 'clave-de-prueba' });
  });

  it('delega generateContent en el SDK con la petición tal cual', async () => {
    const generateContent = jest.fn<AnyFn>().mockResolvedValue({ candidates: [] });
    class FakeSdk {
      models = { generateContent };
    }
    const request = {
      model: 'modelo',
      contents: [{ role: 'user', parts: [{ text: 'hola' }] }],
      config: {},
    } as unknown as GeminiRequest;

    const client = await createGeminiClient({ apiKey: 'k' }, async () => ({ GoogleGenAI: FakeSdk }));
    const response = await client.models.generateContent(request);

    expect(generateContent).toHaveBeenCalledWith(request);
    expect(response).toEqual({ candidates: [] });
  });

  it('si el módulo no exporta el cliente, lanza un error claro', async () => {
    await expect(createGeminiClient({ apiKey: 'k' }, async () => ({}))).rejects.toThrow('@google/genai');
  });
});
