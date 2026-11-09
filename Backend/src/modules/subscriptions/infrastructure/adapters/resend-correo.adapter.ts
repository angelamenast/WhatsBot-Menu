import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AlertaPorVencerCorreo,
  AlertaVencimientoCorreo,
  CorreoPort,
} from '../../application/ports/out/correo.port';
import { enmascararCorreo } from './log-correo.adapter';
import { plantillaPorVencer, plantillaVencida } from './correo/plantillas-correo';
import type { CorreoRenderizado } from './correo/plantillas-correo';

export const RESEND_API_URL = 'https://api.resend.com/emails';
export const FRONTEND_URL_POR_DEFECTO = 'http://localhost:4321';
const TIMEOUT_MS = 10_000;
const ESPERA_REINTENTO_POR_DEFECTO_MS = 1_000;
const ESPERA_REINTENTO_MAXIMA_MS = 10_000;

const esperarMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Adaptador real de CorreoPort (EMAIL_PROVIDER=resend). Usa la API HTTPS de Resend con el
// fetch nativo: no requiere dependencias y funciona en Render gratuito, que bloquea SMTP.
// Sin dominio verificado, Resend solo entrega al correo dueño de la cuenta (remitente
// onboarding@resend.dev); al verificar el dominio solo cambia EMAIL_FROM.
@Injectable()
export class ResendCorreoAdapter implements CorreoPort {
  private readonly logger = new Logger('Correo');
  private readonly apiKey?: string;
  private readonly remitente?: string;
  private readonly urlRenovar: string;
  // Se reemplaza en las pruebas para no esperar de verdad antes del reintento.
  esperar: (ms: number) => Promise<void> = esperarMs;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('RESEND_API_KEY');
    this.remitente = configService.get<string>('EMAIL_FROM');
    const frontendUrl = configService.get<string>('FRONTEND_URL') ?? FRONTEND_URL_POR_DEFECTO;
    this.urlRenovar = `${frontendUrl.replace(/\/+$/, '')}/billing`;
  }

  // Lo llama el factory de CORREO_PORT al arrancar: si se eligió Resend sin configurarlo,
  // la app no inicia (mejor que descubrirlo cuando el job intente enviar).
  validarConfiguracion(): void {
    const faltantes = [
      ['RESEND_API_KEY', this.apiKey],
      ['EMAIL_FROM', this.remitente],
    ]
      .filter(([, valor]) => !valor)
      .map(([nombre]) => nombre);

    if (faltantes.length > 0) {
      throw new Error(`EMAIL_PROVIDER=resend requiere ${faltantes.join(' y ')} en el entorno.`);
    }
  }

  async enviarAlertaPorVencer(alerta: AlertaPorVencerCorreo): Promise<void> {
    await this.enviar(alerta.destinatario, plantillaPorVencer(alerta, this.urlRenovar));
  }

  async enviarAlertaVencida(alerta: AlertaVencimientoCorreo): Promise<void> {
    await this.enviar(alerta.destinatario, plantillaVencida(alerta, this.urlRenovar));
  }

  // Un error aquí lo captura ProcesarVencimientosUseCase por destinatario: se reporta como
  // notificación fallida y el resto del lote sigue.
  private async enviar(destinatario: string, correo: CorreoRenderizado): Promise<void> {
    this.validarConfiguracion();

    let respuesta = await this.llamarApi(destinatario, correo);

    // Resend limita las peticiones por segundo: ante un 429 se reintenta una sola vez.
    if (respuesta.status === 429) {
      await this.esperar(this.calcularEspera(respuesta.headers.get('retry-after')));
      respuesta = await this.llamarApi(destinatario, correo);
    }

    if (!respuesta.ok) {
      throw new Error(`Resend respondió ${respuesta.status}: ${await this.leerMensajeError(respuesta)}`);
    }

    const { id } = (await respuesta.json().catch(() => ({}))) as { id?: string };
    this.logger.log(`Correo enviado a ${enmascararCorreo(destinatario)} | Asunto: ${correo.asunto} | id: ${id ?? '-'}`);
  }

  private llamarApi(destinatario: string, correo: CorreoRenderizado): Promise<Response> {
    return fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.remitente,
        to: [destinatario],
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private calcularEspera(retryAfter: string | null): number {
    const segundos = Number(retryAfter);
    if (!retryAfter || !Number.isFinite(segundos) || segundos < 0) {
      return ESPERA_REINTENTO_POR_DEFECTO_MS;
    }
    return Math.min(segundos * 1000, ESPERA_REINTENTO_MAXIMA_MS);
  }

  private async leerMensajeError(respuesta: Response): Promise<string> {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    return cuerpo?.message ?? respuesta.statusText ?? 'error desconocido';
  }
}
