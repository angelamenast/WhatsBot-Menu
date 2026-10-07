import { Injectable, Logger } from '@nestjs/common';
import type {
  AlertaPorVencerCorreo,
  AlertaVencimientoCorreo,
  CorreoPort,
} from '../../application/ports/out/correo.port';
import { formatearFechaColombia } from '../../../../shared/domain/periodo-suscripcion';

// Oculta la parte local del correo para no dejar datos personales completos en los logs.
export function enmascararCorreo(correo: string): string {
  const [local, dominio] = correo.split('@');
  if (!dominio) {
    return '***';
  }
  return `${local.slice(0, 2)}***@${dominio}`;
}

// Adaptador provisional (EMAIL_PROVIDER=log): no envía correos, los registra en el log.
// Cuando el equipo elija proveedor se agrega otro adaptador de CorreoPort sin tocar la lógica.
@Injectable()
export class LogCorreoAdapter implements CorreoPort {
  private readonly logger = new Logger('Correo');

  async enviarAlertaPorVencer(alerta: AlertaPorVencerCorreo): Promise<void> {
    this.registrar('Tu plan está por vencer', alerta);
  }

  async enviarAlertaVencida(alerta: AlertaVencimientoCorreo): Promise<void> {
    this.registrar('Tu plan venció', alerta);
  }

  private registrar(asunto: string, alerta: AlertaVencimientoCorreo): void {
    this.logger.log(
      `[simulado] Para: ${enmascararCorreo(alerta.destinatario)} | Asunto: ${asunto} | ` +
        `Negocio: ${alerta.nombreNegocio} | Plan: ${alerta.nombrePlan} | ` +
        `Vence: ${formatearFechaColombia(alerta.fechaFin)} | ${alerta.mensaje}`,
    );
  }
}
