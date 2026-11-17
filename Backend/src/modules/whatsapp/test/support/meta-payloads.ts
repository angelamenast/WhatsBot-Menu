import { createHmac } from 'node:crypto';

export const DEFAULT_PHONE_NUMBER_ID = '106540352242922';
export const DEFAULT_CUSTOMER = '573001111111';

/** Firma de Meta: `sha256=` + HMAC-SHA256 hex del cuerpo CRUDO con el App Secret. */
export const signBody = (rawBody: string, secret: string): string =>
  `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

export interface TextMessageOptions {
  id?: string;
  from?: string;
  body?: string;
}

const textMessage = ({ id = 'wamid.IN.1', from = DEFAULT_CUSTOMER, body = 'Hola, quiero ver el menú' }: TextMessageOptions) => ({
  from,
  id,
  timestamp: '1700000000',
  type: 'text',
  text: { body },
});

type RawRecord = Record<string, unknown>;

/** `change` de la Cloud API con field "messages" y la metadata del número receptor. */
export function messagesChange(
  value: { phoneNumberId?: string; messages?: RawRecord[]; statuses?: RawRecord[] },
  contacts: RawRecord[] = [{ profile: { name: 'Cliente' }, wa_id: DEFAULT_CUSTOMER }],
): RawRecord {
  const { phoneNumberId = DEFAULT_PHONE_NUMBER_ID, messages, statuses } = value;

  return {
    field: 'messages',
    value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '15550253483', phone_number_id: phoneNumberId },
      ...(messages ? { contacts, messages } : {}),
      ...(statuses ? { statuses } : {}),
    },
  };
}

export function webhookPayload(...changes: RawRecord[]): RawRecord {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '102290129340398', changes }],
  };
}

export function textPayload(options: TextMessageOptions & { phoneNumberId?: string } = {}): RawRecord {
  const { phoneNumberId, ...message } = options;
  return webhookPayload(messagesChange({ phoneNumberId, messages: [textMessage(message)] }));
}

export function messagesPayload(messages: TextMessageOptions[], phoneNumberId?: string): RawRecord {
  return webhookPayload(messagesChange({ phoneNumberId, messages: messages.map(textMessage) }));
}

export function rawMessagePayload(message: RawRecord, phoneNumberId?: string): RawRecord {
  return webhookPayload(messagesChange({ phoneNumberId, messages: [message] }));
}

export interface StatusOptions {
  id: string;
  status: string;
  recipientId?: string;
  errors?: RawRecord[];
}

export function statusPayload(statuses: StatusOptions[], phoneNumberId?: string): RawRecord {
  return webhookPayload(
    messagesChange({
      phoneNumberId,
      statuses: statuses.map(({ id, status, recipientId = DEFAULT_CUSTOMER, errors }) => ({
        id,
        status,
        timestamp: '1700000100',
        recipient_id: recipientId,
        ...(errors ? { errors } : {}),
      })),
    }),
  );
}
