import { Inject, Injectable } from '@nestjs/common';
import type { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from '../../domain/repositories/suscripcion-consulta.repository';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../../business/domain/repositories/negocio.repository';
import type { TransaccionPagoRepository } from '../../../payments/domain/repositories/transaccion-pago.repository';
import { TRANSACCION_PAGO_REPOSITORY } from '../../../payments/domain/repositories/transaccion-pago.repository';
import type { PaymentGatewayPort } from '../../../payments/domain/repositories/application/ports/out/payment-gateway.port';
import { PAYMENT_GATEWAY } from '../../../payments/domain/repositories/application/ports/out/payment-gateway.port';
import { calcularEstadoAcceso } from '../../domain/estado-acceso';
import { PlanVigenteConfirmarError, SinSuscripcionError } from '../../domain/errors/subscriptions.errors';
import { IniciarRenovacionCommand } from '../dto/iniciar-renovacion.command';

export interface IniciarRenovacionResult {
  referencia: string;
  monto: number;
  moneda: 'COP';
  paymentUrl: string;
}

// HU-8.3: renueva manualmente el plan de la suscripción vigente (cambiar de plan es HU-8).
// No crea una suscripción nueva: registra un pago pendiente sobre la existente, y la
// vigencia solo se extiende cuando Wompi confirma el pago (webhook de HU-8.1).
@Injectable()
export class IniciarRenovacionUseCase {
  constructor(
    @Inject(SUSCRIPCION_CONSULTA_REPOSITORY)
    private readonly suscripcionConsultaRepository: SuscripcionConsultaRepository,
    @Inject(NEGOCIO_REPOSITORY)
    private readonly negocioRepository: NegocioRepository,
    @Inject(TRANSACCION_PAGO_REPOSITORY)
    private readonly transaccionPagoRepository: TransaccionPagoRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGateway: PaymentGatewayPort,
  ) {}

  async execute(command: IniciarRenovacionCommand, ahora: Date = new Date()): Promise<IniciarRenovacionResult> {
    // El negocio sale siempre del token, nunca del body.
    const negocio = await this.negocioRepository.buscarPorUsuario(command.usuarioId);
    if (!negocio) {
      throw new SinSuscripcionError();
    }

    const vigente = await this.suscripcionConsultaRepository.buscarVigentePorNegocio(negocio.id);
    if (!vigente?.plan) {
      throw new SinSuscripcionError();
    }
    const { suscripcion, plan } = vigente;

    // Criterio 2: con más de 3 días de vigencia (estado ACTIVO) se pide confirmación.
    // POR_VENCER y VENCIDO renuevan directo.
    const estado = calcularEstadoAcceso(suscripcion, ahora);
    if (estado === 'ACTIVO' && !command.confirmarRenovacionAnticipada && suscripcion.fechaFin) {
      throw new PlanVigenteConfirmarError(suscripcion.fechaFin);
    }

    // El monto se recalcula siempre con el precio del plan en la BD.
    const monto = plan.precio;
    const referencia = `ren-${suscripcion.id}-${ahora.getTime()}`;

    const link = await this.paymentGateway.crearLinkPago({
      referencia,
      montoEnCentavos: Math.round(monto * 100),
      descripcion: `Renovación ${plan.nombre} - WhatsBot Menu`,
      redirectUrl: command.redirectUrl,
    });

    await this.transaccionPagoRepository.crear({
      suscripcionId: suscripcion.id,
      referenciaWompi: referencia,
      monto,
    });

    return { referencia, monto, moneda: 'COP', paymentUrl: link.url };
  }
}
