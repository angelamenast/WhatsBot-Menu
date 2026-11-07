import { MessagingPort, SendMessageParams, SendMessageResult } from '../../application/ports/out/messaging.port';
import { InvalidMessageBodyError, WhatsappProviderError } from '../../domain/errors/whatsapp.errors';
import { MetaGraphClient } from './meta-graph.client';

export const MAX_MESSAGE_BODY_LENGTH = 4096;

function readMessageId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('messages' in payload)) {
    return null;
  }

  const { messages } = payload;
  const first: unknown = Array.isArray(messages) ? messages[0] : undefined;

  if (typeof first === 'object' && first !== null && 'id' in first && typeof first.id === 'string') {
    return first.id;
  }

  return null;
}

/** Envía texto por la Graph API usando el phone_number_id del negocio y devuelve el wamid. */
export class MetaMessagingAdapter implements MessagingPort {
  constructor(private readonly graphClient: MetaGraphClient) {}

  async sendMessage({ phoneNumberId, to, body }: SendMessageParams): Promise<SendMessageResult> {
    if (body.trim().length === 0) {
      throw new InvalidMessageBodyError('está vacío');
    }

    if (body.length > MAX_MESSAGE_BODY_LENGTH) {
      throw new InvalidMessageBodyError(`supera los ${MAX_MESSAGE_BODY_LENGTH} caracteres`);
    }

    const payload = await this.graphClient.request({
      method: 'POST',
      path: `${encodeURIComponent(phoneNumberId)}/messages`,
      body: {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
    });

    const providerMessageId = readMessageId(payload);

    if (!providerMessageId) {
      throw new WhatsappProviderError('La Graph API respondió sin el id del mensaje');
    }

    return { providerMessageId, status: 'sent' };
  }
}
