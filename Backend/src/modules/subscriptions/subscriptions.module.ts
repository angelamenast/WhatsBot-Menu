import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsController } from './infrastructure/presentation/controllers/subscriptions.controller';
import { ObtenerEstadoSuscripcionUseCase } from './application/use-cases/obtener-estado-suscripcion.use-case';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from './domain/repositories/suscripcion-consulta.repository';
import { SupabaseSuscripcionConsultaRepository } from './infrastructure/persistence/supabase-suscripcion-consulta.repository';
import { SubscriptionPlanStatusAdapter } from './infrastructure/adapters/subscription-plan-status.adapter';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionsController],
  providers: [
    ObtenerEstadoSuscripcionUseCase,
    SupabaseSuscripcionConsultaRepository,
    { provide: SUSCRIPCION_CONSULTA_REPOSITORY, useExisting: SupabaseSuscripcionConsultaRepository },
    SubscriptionPlanStatusAdapter,
  ],
  // Los módulos que usen el adaptador de PlanStatusPort importan este módulo.
  exports: [ObtenerEstadoSuscripcionUseCase, SubscriptionPlanStatusAdapter],
})
export class SubscriptionsModule {}
