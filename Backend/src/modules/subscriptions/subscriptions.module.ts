import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { SubscriptionsController } from './infrastructure/presentation/controllers/subscriptions.controller';
import { ObtenerEstadoSuscripcionUseCase } from './application/use-cases/obtener-estado-suscripcion.use-case';
import { IniciarRenovacionUseCase } from './application/use-cases/iniciar-renovacion.use-case';
import { ConsultarRenovacionUseCase } from './application/use-cases/consultar-renovacion.use-case';
import { ProcesarVencimientosUseCase } from './application/use-cases/procesar-vencimientos.use-case';
import { CORREO_PORT } from './application/ports/out/correo.port';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from './domain/repositories/suscripcion-consulta.repository';
import { VENCIMIENTOS_REPOSITORY } from './domain/repositories/vencimientos.repository';
import { SupabaseSuscripcionConsultaRepository } from './infrastructure/persistence/supabase-suscripcion-consulta.repository';
import { SupabaseVencimientosRepository } from './infrastructure/persistence/supabase-vencimientos.repository';
import { PlanActivoGuard } from './infrastructure/presentation/guards/plan-activo.guard';
import { SubscriptionPlanStatusAdapter } from './infrastructure/adapters/subscription-plan-status.adapter';
import { LogCorreoAdapter } from './infrastructure/adapters/log-correo.adapter';
import { VencimientosJob } from './infrastructure/jobs/vencimientos.job';
import { TRANSACCION_PAGO_REPOSITORY } from '../payments/domain/repositories/transaccion-pago.repository';
import { SupabaseTransaccionPagoRepository } from '../payments/infrastructure/persistence/supabase-transaccion-pago.repository';
import { SUSCRIPCION_REPOSITORY } from '../payments/domain/repositories/suscripcion.repository';
import { SupabaseSuscripcionRepository } from '../payments/infrastructure/persistence/supabase-suscripcion.repository';
import { PAYMENT_GATEWAY } from '../payments/domain/repositories/application/ports/out/payment-gateway.port';
import { WompiPaymentGatewayAdapter } from '../payments/infrastructure/adapters/wompi-payment-gateway.adapter';

@Module({
  imports: [
    AuthModule,
    // BusinessModule exporta NEGOCIO_REPOSITORY, que resuelve el negocio del usuario autenticado.
    BusinessModule,
    // Activa los @Cron de la aplicación. Se registra aquí para no tocar app.module.ts; si otro
    // módulo necesita tareas programadas, moverlo a AppModule y quitarlo de aquí (registrarlo
    // dos veces duplicaría las ejecuciones).
    ScheduleModule.forRoot(),
  ],
  controllers: [SubscriptionsController],
  providers: [
    ObtenerEstadoSuscripcionUseCase,
    IniciarRenovacionUseCase,
    ConsultarRenovacionUseCase,
    ProcesarVencimientosUseCase,
    SupabaseSuscripcionConsultaRepository,
    { provide: SUSCRIPCION_CONSULTA_REPOSITORY, useExisting: SupabaseSuscripcionConsultaRepository },
    SupabaseVencimientosRepository,
    { provide: VENCIMIENTOS_REPOSITORY, useExisting: SupabaseVencimientosRepository },
    // Clases de payments (HU-8.1) reutilizadas tal cual: no se duplica su código, solo se
    // registran aquí porque PaymentsModule aún no exporta sus tokens. Cuando los exporte, se
    // reemplazan estas líneas por `PaymentsModule` en imports.
    SupabaseTransaccionPagoRepository,
    { provide: TRANSACCION_PAGO_REPOSITORY, useExisting: SupabaseTransaccionPagoRepository },
    SupabaseSuscripcionRepository,
    { provide: SUSCRIPCION_REPOSITORY, useExisting: SupabaseSuscripcionRepository },
    WompiPaymentGatewayAdapter,
    { provide: PAYMENT_GATEWAY, useExisting: WompiPaymentGatewayAdapter },
    // Proveedor de correo elegido por EMAIL_PROVIDER (por ahora solo "log").
    LogCorreoAdapter,
    {
      provide: CORREO_PORT,
      inject: [ConfigService, LogCorreoAdapter],
      useFactory: (configService: ConfigService, logCorreoAdapter: LogCorreoAdapter) => {
        const proveedor = configService.get<string>('EMAIL_PROVIDER') ?? 'log';
        switch (proveedor) {
          case 'log':
            return logCorreoAdapter;
          default:
            throw new Error(`EMAIL_PROVIDER inválido: "${proveedor}". Por ahora solo está implementado "log".`);
        }
      },
    },
    VencimientosJob,
    PlanActivoGuard,
    SubscriptionPlanStatusAdapter,
  ],
  // Los módulos que usen PlanActivoGuard o el adaptador de PlanStatusPort importan este módulo.
  exports: [ObtenerEstadoSuscripcionUseCase, PlanActivoGuard, SubscriptionPlanStatusAdapter],
})
export class SubscriptionsModule {}
