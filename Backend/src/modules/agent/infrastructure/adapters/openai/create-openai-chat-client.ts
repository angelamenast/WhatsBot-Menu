import type { OpenAiChatClient, OpenAiChatRequest } from './openai-chat-client';
import type { OpenAiConfig } from './openai-config';

// Lo mínimo que se usa del constructor del SDK; permite inyectar uno falso en los tests.
type OpenAiSdkConstructor = new (options: { apiKey: string; timeout: number; maxRetries: number }) => {
  chat: { completions: { create(request: any): Promise<any> } };
};
type SdkModule = { OpenAI?: OpenAiSdkConstructor; default?: OpenAiSdkConstructor };
type SdkLoader = () => Promise<SdkModule>;

/**
 * Crea el cliente real del SDK `openai`. Carga perezosa: el SDK solo se importa si
 * LLM_PROVIDER=openai. `maxRetries: 0` porque la respuesta es síncrona dentro del webhook de
 * Twilio: un reintento automático podría pasarse del tiempo; la contingencia ya cubre el fallo.
 */
export async function createOpenAiChatClient(
  config: OpenAiConfig,
  loadSdk: SdkLoader = () => import('openai') as unknown as Promise<SdkModule>,
): Promise<OpenAiChatClient> {
  const sdkModule = await loadSdk();
  const OpenAI = sdkModule.OpenAI ?? sdkModule.default;

  if (!OpenAI) {
    throw new Error('El paquete openai no exporta el cliente esperado');
  }

  const sdk = new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: 0,
  });

  return {
    chat: {
      completions: {
        create: (request: OpenAiChatRequest) => sdk.chat.completions.create(request),
      },
    },
  };
}
