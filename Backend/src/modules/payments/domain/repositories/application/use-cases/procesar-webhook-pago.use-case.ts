import { Inject, Injectable } from '@nestjs/common';
import type { TransaccionPagoRepository } from '../../transaccion-pago.repository';
import { TRANSACCION_PAGO_REPOSITORY } from '../../transaccion-pago.repository';
import type { SuscripcionRepository } from '../../suscripcion.repository';
import { SUSCRIPCION_REPOSITORY } from '../../suscripcion.repository';
import { ProcesarWebhookPagoCommand } from '../dto/procesar-webhook-pago.command';
import { SuscripcionNoEncontradaError, TransaccionNoEncontradaError } from '../../../errors/payments.errors';
import { calcularNuevaFechaFin, DURACION_PLAN_MESES } from '../../../../../../shared/domain/periodo-suscripcion';

const ESTADOS_FINALES = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];

@Injectable()
export class ProcesarWebhookPagoUseCase {
  constructor(
    @Inject(TRANSACCION_PAGO_REPOSITORY) private readonly transaccionRepository: TransaccionPagoRepository,
    @Inject(SUSCRIPCION_REPOSITORY) private readonly suscripcionRepository: SuscripcionRepository,
  ) {}

  async execute(command: ProcesarWebhookPagoCommand, ahora: Date = new Date()): Promise<void> {
    const transaccion = await this.transaccionRepository.buscarPorReferencia(command.referenciaWompi);

    if (!transaccion) {
      throw new TransaccionNoEncontradaError();
    }

    // Un pago aprobado es definitivo: los avisos repetidos de Wompi no vuelven a extender
    // la vigencia. Un rechazo no lo es: el mismo link admite reintentar con otro medio de pago.
    if (transaccion.estado === 'aprobado') {
      return;
    }

    // Solo actuamos con estados finales (ignoramos, por ejemplo, PENDING)
    if (!ESTADOS_FINALES.includes(command.estadoTransaccion)) {
      return;
    }

    if (command.estadoTransaccion !== 'APPROVED') {
      await this.transaccionRepository.actualizarEstado(transaccion.id, 'rechazado');
      return;
    }

    const suscripcion = await this.suscripcionRepository.buscarPorId(transaccion.suscripcionId);
    if (!suscripcion) {
      throw new SuscripcionNoEncontradaError();
    }

    // Compra nueva (pendiente): el periodo empieza hoy. Renovación (activa o vencida): se
    // conserva fecha_inicio y el periodo se suma a fecha_fin si aún no vencía (HU-8.3).
    const esRenovacion = suscripcion.estado === 'activa' || suscripcion.estado === 'vencida';

    // Primero la vigencia y luego el pago: si algo falla en medio, la transacción sigue
    // pendiente, el webhook responde error y Wompi reintenta, así el cliente no queda sin servicio.
    await this.suscripcionRepository.actualizarEstado(suscripcion.id, 'activa', {
      fechaInicio: esRenovacion && suscripcion.fechaInicio ? suscripcion.fechaInicio : ahora,
      fechaFin: calcularNuevaFechaFin(esRenovacion ? suscripcion.fechaFin : null, ahora, DURACION_PLAN_MESES),
    });
    await this.transaccionRepository.actualizarEstado(transaccion.id, 'aprobado');
  }
}
