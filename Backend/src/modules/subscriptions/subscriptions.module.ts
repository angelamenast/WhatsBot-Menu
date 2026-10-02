import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { SubscriptionsController } from './infrastructure/presentation/controllers/subscriptions.controller';
import { ObtenerEstadoSuscripcionUseCase } from './application/use-cases/obtener-estado-suscripcion.use-case';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from './domain/repositories/suscripcion-consulta.repository';
import { SupabaseSuscripcionConsultaRepository } from './infrastructure/persistence/supabase-suscripcion-consulta.repository';
import { PlanActivoGuard } from './infrastructure/presentation/guards/plan-activo.guard';
import { SubscriptionPlanStatusAdapter } from './infrastructure/adapters/subscription-plan-status.adapter';

@Module({
  // BusinessModule exporta NEGOCIO_REPOSITORY, que resuelve el negocio del usuario autenticado.
  imports: [AuthModule, BusinessModule],
  controllers: [SubscriptionsController],
  providers: [
    ObtenerEstadoSuscripcionUseCase,
    SupabaseSuscripcionConsultaRepository,
    { provide: SUSCRIPCION_CONSULTA_REPOSITORY, useExisting: SupabaseSuscripcionConsultaRepository },
    PlanActivoGuard,
    SubscriptionPlanStatusAdapter,
  ],
  // Los módulos que usen PlanActivoGuard o el adaptador de PlanStatusPort importan este módulo.
  exports: [ObtenerEstadoSuscripcionUseCase, PlanActivoGuard, SubscriptionPlanStatusAdapter],
})
export class SubscriptionsModule {}
