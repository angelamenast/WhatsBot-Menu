export interface CrearLinkPagoParams {
  referencia: string;
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