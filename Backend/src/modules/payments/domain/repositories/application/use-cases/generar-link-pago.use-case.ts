import { Inject, Injectable } from '@nestjs/common';
import type { PlanRepository } from '../../plan.repository';
import { PLAN_REPOSITORY } from '../../plan.repository';
import type { SuscripcionRepository } from '../../suscripcion.repository';
import { SUSCRIPCION_REPOSITORY } from '../../suscripcion.repository';
import type { TransaccionPagoRepository } from '../../transaccion-pago.repository';
import { TRANSACCION_PAGO_REPOSITORY } from '../../transaccion-pago.repository';
import type { PaymentGatewayPort } from '../ports/out/payment-gateway.port';
import { PAYMENT_GATEWAY } from '../ports/out/payment-gateway.port';
import { GenerarLinkPagoCommand } from '../dto/generar-link-pago.command';
import { PlanNoEncontradoError } from '../../../errors/payments.errors';

export interface GenerarLinkPagoResult {
  paymentUrl: string;
  suscripcionId: string;
}

@Injectable()
export class GenerarLinkPagoUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepository: PlanRepository,
    @Inject(SUSCRIPCION_REPOSITORY) private readonly suscripcionRepository: SuscripcionRepository,
    @Inject(TRANSACCION_PAGO_REPOSITORY) private readonly transaccionRepository: TransaccionPagoRepository,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
  ) {}

  async execute(command: GenerarLinkPagoCommand): Promise<GenerarLinkPagoResult> {
    const plan = await this.planRepository.buscarPorId(command.planId);
    if (!plan) {
      throw new PlanNoEncontradoError();
    }

    const suscripcion = await this.suscripcionRepository.crear({
      negocioId: command.negocioId,
      planId: command.planId,
    });

    const montoEnCentavos = Math.round(plan.precio * 100);

    const link = await this.paymentGateway.crearLinkPago({
      montoEnCentavos,
      descripcion: `Suscripción ${plan.nombre} - WhatsBot Menu`,
      redirectUrl: command.redirectUrl,
    });

    // Wompi identifica el pago por el id del link (payment_link_id en el webhook),
    // así que ese id es la referencia con la que se busca la transacción.
    await this.transaccionRepository.crear({
      suscripcionId: suscripcion.id,
      referenciaWompi: link.id,
      monto: plan.precio,
    });

    return { paymentUrl: link.url, suscripcionId: suscripcion.id };
  }
}