import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../../business/domain/repositories/negocio.repository';
import type { TransaccionPagoRepository } from '../../../payments/domain/repositories/transaccion-pago.repository';
import { TRANSACCION_PAGO_REPOSITORY } from '../../../payments/domain/repositories/transaccion-pago.repository';
import type { SuscripcionRepository } from '../../../payments/domain/repositories/suscripcion.repository';
import { SUSCRIPCION_REPOSITORY } from '../../../payments/domain/repositories/suscripcion.repository';
import type { EstadoTransaccion } from '../../../payments/domain/entities/transaccion-pago.entity';
import { RenovacionNoEncontradaError } from '../../domain/errors/subscriptions.errors';
import { ConsultarRenovacionCommand } from '../dto/consultar-renovacion.command';

export type EstadoRenovacion = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export interface ConsultarRenovacionResult {
  referencia: string;
  estado: EstadoRenovacion;
  fechaFin: Date | null;
  mensaje: string;
}

const ESTADOS: Record<EstadoTransaccion, { estado: EstadoRenovacion; mensaje: string }> = {
  pendiente: {
    estado: 'PENDIENTE',
    mensaje: 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.',
  },
  aprobado: { estado: 'APROBADO', mensaje: 'Plan renovado correctamente.' },
  rechazado: { estado: 'RECHAZADO', mensaje: 'No pudimos procesar la renovación. Intenta nuevamente.' },
};

// Lee el pago y la suscripción con los repositorios de payments (dueño de esas tablas):
// este módulo solo consulta, el webhook de HU-8.1 es quien los actualiza.
@Injectable()
export class ConsultarRenovacionUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY)
    private readonly negocioRepository: NegocioRepository,
    @Inject(TRANSACCION_PAGO_REPOSITORY)
    private readonly transaccionPagoRepository: TransaccionPagoRepository,
    @Inject(SUSCRIPCION_REPOSITORY)
    private readonly suscripcionRepository: SuscripcionRepository,
  ) {}

  async execute(command: ConsultarRenovacionCommand): Promise<ConsultarRenovacionResult> {
    const [negocio, transaccion] = await Promise.all([
      this.negocioRepository.buscarPorUsuario(command.usuarioId),
      this.transaccionPagoRepository.buscarPorReferencia(command.referencia),
    ]);

    const suscripcion = transaccion ? await this.suscripcionRepository.buscarPorId(transaccion.suscripcionId) : null;

    // Si la referencia es de otro negocio se responde igual que si no existiera,
    // para no revelar referencias ajenas.
    if (!transaccion || !suscripcion || !negocio || suscripcion.negocioId !== negocio.id) {
      throw new RenovacionNoEncontradaError();
    }

    const { estado, mensaje } = ESTADOS[transaccion.estado];

    return {
      referencia: transaccion.referenciaWompi,
      estado,
      // Criterio 1: la nueva fecha solo se informa cuando el pago ya fue aprobado.
      fechaFin: estado === 'APROBADO' ? suscripcion.fechaFin : null,
      mensaje,
    };
  }
}
