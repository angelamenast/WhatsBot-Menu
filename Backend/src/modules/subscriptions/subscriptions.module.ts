import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { SubscriptionsController } from './infrastructure/presentation/controllers/subscriptions.controller';
import { ObtenerEstadoSuscripcionUseCase } from './application/use-cases/obtener-estado-suscripcion.use-case';
import { IniciarRenovacionUseCase } from './application/use-cases/iniciar-renovacion.use-case';
import { ConsultarRenovacionUseCase } from './application/use-cases/consultar-renovacion.use-case';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from './domain/repositories/suscripcion-consulta.repository';
import { SupabaseSuscripcionConsultaRepository } from './infrastructure/persistence/supabase-suscripcion-consulta.repository';
import { PlanActivoGuard } from './infrastructure/presentation/guards/plan-activo.guard';
import { SubscriptionPlanStatusAdapter } from './infrastructure/adapters/subscription-plan-status.adapter';
import { TRANSACCION_PAGO_REPOSITORY } from '../payments/domain/repositories/transaccion-pago.repository';
import { SupabaseTransaccionPagoRepository } from '../payments/infrastructure/persistence/supabase-transaccion-pago.repository';
import { SUSCRIPCION_REPOSITORY } from '../payments/domain/repositories/suscripcion.repository';
import { SupabaseSuscripcionRepository } from '../payments/infrastructure/persistence/supabase-suscripcion.repository';
import { PAYMENT_GATEWAY } from '../payments/domain/repositories/application/ports/out/payment-gateway.port';
import { WompiPaymentGatewayAdapter } from '../payments/infrastructure/adapters/wompi-payment-gateway.adapter';

@Module({
  // BusinessModule exporta NEGOCIO_REPOSITORY, que resuelve el negocio del usuario autenticado.
  imports: [AuthModule, BusinessModule],
  controllers: [SubscriptionsController],
  providers: [
    ObtenerEstadoSuscripcionUseCase,
    IniciarRenovacionUseCase,
    ConsultarRenovacionUseCase,
    SupabaseSuscripcionConsultaRepository,
    { provide: SUSCRIPCION_CONSULTA_REPOSITORY, useExisting: SupabaseSuscripcionConsultaRepository },
    // Clases de payments (HU-8.1) reutilizadas tal cual: no se duplica su código, solo se
    // registran aquí porque PaymentsModule aún no exporta sus tokens. Cuando los exporte, se
    // reemplazan estas líneas por `PaymentsModule` en imports.
    SupabaseTransaccionPagoRepository,
    { provide: TRANSACCION_PAGO_REPOSITORY, useExisting: SupabaseTransaccionPagoRepository },
    SupabaseSuscripcionRepository,
    { provide: SUSCRIPCION_REPOSITORY, useExisting: SupabaseSuscripcionRepository },
    WompiPaymentGatewayAdapter,
    { provide: PAYMENT_GATEWAY, useExisting: WompiPaymentGatewayAdapter },
    PlanActivoGuard,
    SubscriptionPlanStatusAdapter,
  ],
  // Los módulos que usen PlanActivoGuard o el adaptador de PlanStatusPort importan este módulo.
  exports: [ObtenerEstadoSuscripcionUseCase, PlanActivoGuard, SubscriptionPlanStatusAdapter],
})
export class SubscriptionsModule {}
