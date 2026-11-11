import type { GeminiClient, GeminiRequest, GeminiResponse } from './gemini-client';
import type { GeminiConfig } from './gemini-config';

// Lo mínimo que se usa del SDK; permite inyectar uno falso en los tests.
type SdkModule = {
  GoogleGenAI?: new (options: { apiKey: string }) => {
    models: { generateContent(request: GeminiRequest): Promise<GeminiResponse> };
  };
};
type SdkLoader = () => Promise<SdkModule>;

/**
 * Crea el cliente real de `@google/genai` contra el endpoint nativo de Gemini (la clave de Google
 * AI Studio). Carga perezosa: el SDK solo se importa si LLM_PROVIDER=gemini. No se configuran
 * `retryOptions`, así que el SDK hace un solo intento (la respuesta es interactiva y la
 * contingencia ya cubre el fallo); el timeout lo aplica el adaptador con un AbortSignal.
 */
export async function createGeminiClient(
  config: Pick<GeminiConfig, 'apiKey'>,
  loadSdk: SdkLoader = () => import('@google/genai') as unknown as Promise<SdkModule>,
): Promise<GeminiClient> {
  const { GoogleGenAI: Sdk } = await loadSdk();

  if (!Sdk) {
    throw new Error('El paquete @google/genai no exporta el cliente esperado');
  }

  const sdk = new Sdk({ apiKey: config.apiKey });

  return {
    models: {
      generateContent: (request: GeminiRequest) => sdk.models.generateContent(request),
    },
  };
}
