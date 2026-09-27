import { Inject, Injectable } from '@nestjs/common';
import type { TransaccionPagoRepository } from '../../transaccion-pago.repository';
import { TRANSACCION_PAGO_REPOSITORY } from '../../transaccion-pago.repository';
import type { SuscripcionRepository } from '../../suscripcion.repository';
import { SUSCRIPCION_REPOSITORY } from '../../suscripcion.repository';
import { ProcesarWebhookPagoCommand } from '../dto/procesar-webhook-pago.command';
import { TransaccionNoEncontradaError } from '../../../errors/payments.errors';

@Injectable()
export class ProcesarWebhookPagoUseCase {
  constructor(
    @Inject(TRANSACCION_PAGO_REPOSITORY) private readonly transaccionRepository: TransaccionPagoRepository,
    @Inject(SUSCRIPCION_REPOSITORY) private readonly suscripcionRepository: SuscripcionRepository,
  ) {}

  async execute(command: ProcesarWebhookPagoCommand): Promise<void> {
    const transaccion = await this.transaccionRepository.buscarPorReferencia(command.referenciaWompi);

    if (!transaccion) {
      throw new TransaccionNoEncontradaError();
    }

    const nuevoEstado = command.estadoTransaccion === 'APPROVED' ? 'aprobado' : 'rechazado';
    await this.transaccionRepository.actualizarEstado(transaccion.id, nuevoEstado);

    if (nuevoEstado === 'aprobado') {
      const fechaInicio = new Date();
      const fechaFin = new Date();
      fechaFin.setMonth(fechaFin.getMonth() + 1);

      await this.suscripcionRepository.actualizarEstado(transaccion.suscripcionId, 'activa', {
        fechaInicio,
        fechaFin,
      });
    }
  }
}