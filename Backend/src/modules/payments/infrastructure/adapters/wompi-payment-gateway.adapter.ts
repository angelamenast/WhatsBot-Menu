import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { PaymentGatewayPort, CrearLinkPagoParams, LinkPago, WebhookPagoPayload } from '../../domain/repositories/application/ports/out/payment-gateway.port';

@Injectable()
export class WompiPaymentGatewayAdapter implements PaymentGatewayPort {
  private readonly baseUrl?: string;
  private readonly privateKey?: string;
  private readonly eventsSecret?: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('WOMPI_BASE_URL');
    this.privateKey = this.configService.get<string>('WOMPI_PRIVATE_KEY');
    this.eventsSecret = this.configService.get<string>('WOMPI_EVENTS_SECRET');
  }

  async crearLinkPago(params: CrearLinkPagoParams): Promise<LinkPago> {
    if (!this.baseUrl || !this.privateKey) {
      throw new BadRequestException('La configuración de Wompi está incompleta');
    }

    const response = await fetch(`${this.baseUrl}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.descripcion,
        description: params.descripcion,
        single_use: true,
        collect_shipping: false,
        currency: 'COP',
        amount_in_cents: params.montoEnCentavos,
        redirect_url: params.redirectUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new BadRequestException('No se pudo generar el link de pago');
    }

    return { id: data.data.id, url: `https://checkout.wompi.co/l/${data.data.id}` };
  }

  verificarFirmaWebhook(payload: WebhookPagoPayload): boolean {
  if (!this.eventsSecret) return false;

  try {
    const crudo = payload.crudo as any;
    const props: string[] = crudo.signature.properties;

    let concatenado = '';
    for (const prop of props) {
      concatenado += prop.split('.').reduce((obj, k) => obj[k], crudo.data);
    }
    concatenado += crudo.timestamp + this.eventsSecret;

    const calculado = crypto.createHash('sha256').update(concatenado).digest('hex');
    const recibido = (payload.firmaRecibida ?? '').toLowerCase();

    const a = Buffer.from(calculado);
    const b = Buffer.from(recibido);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
}