import type { ProviderMessageStatus } from '../../application/dto/handle-status-callback.command';

export interface ParsedIncomingMessage {
  phoneNumberId: string;
  customerNumber: string;
  text: string;
  providerMessageId: string;
}

export interface ParsedStatusUpdate {
  providerMessageId: string;
  status: ProviderMessageStatus;
  error?: { code: number; message: string };
}

export interface ParsedMetaWebhook {
  messages: ParsedIncomingMessage[];
  statuses: ParsedStatusUpdate[];
  /** Tipos de mensaje no textuales que se descartaron (image, audio, ...), uno por mensaje. */
  unsupportedMessageTypes: string[];
}

const SUPPORTED_STATUSES: readonly ProviderMessageStatus[] = ['sent', 'delivered', 'read', 'failed'];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isSupportedStatus(value: unknown): value is ProviderMessageStatus {
  return SUPPORTED_STATUSES.some((status) => status === value);
}

function parseStatus(raw: UnknownRecord): ParsedStatusUpdate | null {
  if (typeof raw.id !== 'string' || !isSupportedStatus(raw.status)) {
    return null;
  }

  const update: ParsedStatusUpdate = { providerMessageId: raw.id, status: raw.status };
  const [firstError] = asRecords(raw.errors);

  if (firstError && typeof firstError.code === 'number') {
    const message = firstError.message ?? firstError.title;
    update.error = { code: firstError.code, message: typeof message === 'string' ? message : '' };
  }

  return update;
}

/**
 * Extrae mensajes de texto y estados de entrega del payload de la Cloud API
 * (entry[].changes[].value con field === 'messages'). Función pura: nunca lanza ante un payload
 * inesperado, devuelve vacío. Un solo POST puede traer varios mensajes y varios estados.
 */
export function parseMetaWebhook(body: unknown): ParsedMetaWebhook {
  const result: ParsedMetaWebhook = { messages: [], statuses: [], unsupportedMessageTypes: [] };

  if (!isRecord(body)) {
    return result;
  }

  for (const entry of asRecords(body.entry)) {
    for (const change of asRecords(entry.changes)) {
      if (change.field !== 'messages' || !isRecord(change.value)) {
        continue;
      }

      const { value } = change;
      const phoneNumberId = isRecord(value.metadata) ? value.metadata.phone_number_id : undefined;

      for (const rawMessage of asRecords(value.messages)) {
        if (rawMessage.type !== 'text') {
          result.unsupportedMessageTypes.push(typeof rawMessage.type === 'string' ? rawMessage.type : 'unknown');
          continue;
        }

        const body = isRecord(rawMessage.text) ? rawMessage.text.body : undefined;

        if (
          typeof phoneNumberId === 'string' &&
          typeof rawMessage.from === 'string' &&
          typeof rawMessage.id === 'string' &&
          typeof body === 'string'
        ) {
          result.messages.push({
            phoneNumberId,
            customerNumber: rawMessage.from,
            text: body,
            providerMessageId: rawMessage.id,
          });
        }
      }

      for (const rawStatus of asRecords(value.statuses)) {
        const status = parseStatus(rawStatus);

        if (status) {
          result.statuses.push(status);
        }
      }
    }
  }

  return result;
}
