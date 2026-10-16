// Los links de pago de Wompi no admiten una referencia propia: el pago se identifica con
// el id del link (LinkPago.id), que Wompi envía en el webhook como payment_link_id.
export interface CrearLinkPagoParams {
  montoEnCentavos: number;
  descripcion: string;
  redirectUrl: string;
}

export interface LinkPago {
  id: string;
  url: string;
}

export interface WebhookPagoPayload {
  referencia: string;
  estado: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';
  firmaRecibida: string;
  crudo: unknown; // el payload original, por si el adaptador necesita recalcular el checksum
}

export interface PaymentGatewayPort {
  crearLinkPago(params: CrearLinkPagoParams): Promise<LinkPago>;
  verificarFirmaWebhook(payload: WebhookPagoPayload): boolean;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');