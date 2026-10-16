import { Inject, Injectable } from '@nestjs/common';
import type { VencimientosRepository } from '../../domain/repositories/vencimientos.repository';
import { VENCIMIENTOS_REPOSITORY } from '../../domain/repositories/vencimientos.repository';
import type { CorreoPort } from '../ports/out/correo.port';
import { CORREO_PORT } from '../ports/out/correo.port';
import { SuscripcionPorNotificar } from '../../domain/entities/suscripcion-por-notificar.entity';
import {
  MENSAJE_ALERTA_VENCIDO,
  calcularVentanaAvisoPorVencer,
  mensajeAlertaPorVencer,
} from '../../domain/alertas-vencimiento';
import type { TipoAlerta } from '../../domain/alertas-vencimiento';
import { calcularDiasRestantes } from '../../domain/estado-acceso';

export interface NotificacionFallida {
  suscripcionId: string;
  tipo: TipoAlerta;
  motivo: string;
}

export interface ResumenVencimientos {
  marcadasVencidas: number;
  alertasVencidoEnviadas: number;
  alertasPorVencerEnviadas: number;
  fallidas: NotificacionFallida[];
}

// HU-8.4: verificación periódica de vencimientos (la dispara el job diario).
@Injectable()
export class ProcesarVencimientosUseCase {
  constructor(
    @Inject(VENCIMIENTOS_REPOSITORY)
    private readonly vencimientosRepository: VencimientosRepository,
    @Inject(CORREO_PORT)
    private readonly correoPort: CorreoPort,
  ) {}

  async execute(ahora: Date = new Date()): Promise<ResumenVencimientos> {
    const fallidas: NotificacionFallida[] = [];

    // Criterio 3: se marcan VENCIDO y se notifica la restricción. Solo se notifican las
    // suscripciones que esta ejecución cambió, así que repetir el job no duplica correos.
    const vencidas = await this.vencimientosRepository.marcarVencidas(ahora);
    let alertasVencidoEnviadas = 0;
    for (const suscripcion of vencidas) {
      const enviada = await this.notificar(suscripcion, 'VENCIDO', fallidas, (destinatario) =>
        this.correoPort.enviarAlertaVencida({
          ...this.datosCorreo(suscripcion, destinatario),
          mensaje: MENSAJE_ALERTA_VENCIDO,
        }),
      );
      if (enviada) alertasVencidoEnviadas++;
    }

    // Criterios 1 y 2: planes que entran hoy en la ventana de aviso de 3 días.
    const ventana = calcularVentanaAvisoPorVencer(ahora);
    const porVencer = await this.vencimientosRepository.buscarActivasQueVencenEntre(ventana.desde, ventana.hasta);
    let alertasPorVencerEnviadas = 0;
    for (const suscripcion of porVencer) {
      const diasRestantes = calcularDiasRestantes(suscripcion.fechaFin, ahora) ?? 0;
      const enviada = await this.notificar(suscripcion, 'POR_VENCER', fallidas, (destinatario) =>
        this.correoPort.enviarAlertaPorVencer({
          ...this.datosCorreo(suscripcion, destinatario),
          diasRestantes,
          mensaje: mensajeAlertaPorVencer(diasRestantes),
        }),
      );
      if (enviada) alertasPorVencerEnviadas++;
    }

    return { marcadasVencidas: vencidas.length, alertasVencidoEnviadas, alertasPorVencerEnviadas, fallidas };
  }

  // Un fallo al notificar a un negocio no detiene el resto del lote: se registra y se sigue.
  private async notificar(
    suscripcion: SuscripcionPorNotificar,
    tipo: TipoAlerta,
    fallidas: NotificacionFallida[],
    enviar: (destinatario: string) => Promise<void>,
  ): Promise<boolean> {
    try {
      const destinatario = await this.vencimientosRepository.buscarCorreoDelDueno(suscripcion.usuarioId);
      if (!destinatario) {
        fallidas.push({ suscripcionId: suscripcion.suscripcionId, tipo, motivo: 'El dueño no tiene correo registrado' });
        return false;
      }

      await enviar(destinatario);
      return true;
    } catch (error) {
      fallidas.push({ suscripcionId: suscripcion.suscripcionId, tipo, motivo: (error as Error).message });
      return false;
    }
  }

  private datosCorreo(suscripcion: SuscripcionPorNotificar, destinatario: string) {
    return {
      destinatario,
      nombreNegocio: suscripcion.nombreNegocio,
      nombrePlan: suscripcion.nombrePlan,
      fechaFin: suscripcion.fechaFin,
    };
  }
}
