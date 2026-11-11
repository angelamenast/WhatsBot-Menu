import { createHash, randomUUID } from 'node:crypto';

export type WompiStatus = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';

export interface WompiEventOptions {
  paymentLinkId: string;
  status: WompiStatus;
  amountInCents: number;
  /** Con qué secret firmar (normalmente WOMPI_TEST_EVENTS_SECRET). */
  secret: string;
  transactionId?: string;
  timestamp?: number;
}

const PROPERTIES = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];

const valueAt = (data: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((obj, key) => (obj as Record<string, unknown>)[key], data);

/** Checksum como lo calcula Wompi: SHA-256(valores de signature.properties + timestamp + secret). */
export function wompiChecksum(data: Record<string, unknown>, properties: string[], timestamp: number, secret: string): string {
  const concatenado = properties.map((prop) => String(valueAt(data, prop))).join('') + timestamp + secret;
  return createHash('sha256').update(concatenado).digest('hex');
}

/** Evento transaction.updated con la forma que envía Wompi, firmado con `secret`. */
export function buildWompiEvent(options: WompiEventOptions) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const transactionId = options.transactionId ?? `it-${randomUUID()}`;
  const data = {
    transaction: {
      id: transactionId,
      amount_in_cents: options.amountInCents,
      reference: `it-ref-${randomUUID()}`,
      customer_email: 'it@test.local',
      currency: 'COP',
      payment_method_type: 'CARD',
      redirect_url: 'http://localhost:4321/billing',
      status: options.status,
      payment_link_id: options.paymentLinkId,
    },
  };

  return {
    event: 'transaction.updated',
    data,
    environment: 'test',
    signature: {
      properties: [...PROPERTIES],
      checksum: wompiChecksum(data, PROPERTIES, timestamp, options.secret),
    },
    timestamp,
    sent_at: new Date(timestamp * 1000).toISOString(),
  };
}
