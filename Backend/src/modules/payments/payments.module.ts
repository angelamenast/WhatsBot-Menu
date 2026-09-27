import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './infrastructure/presentation/controllers/payments.controller';
import { GenerarLinkPagoUseCase } from './domain/repositories/application/use-cases/generar-link-pago.use-case';
import { ProcesarWebhookPagoUseCase } from './domain/repositories/application/use-cases/procesar-webhook-pago.use-case';
import { PLAN_REPOSITORY } from './domain/repositories/plan.repository';
import { SUSCRIPCION_REPOSITORY } from './domain/repositories/suscripcion.repository';
import { TRANSACCION_PAGO_REPOSITORY } from './domain/repositories/transaccion-pago.repository';
import { SupabasePlanRepository } from './infrastructure/persistence/supabase-plan.repository';
import { SupabaseSuscripcionRepository } from './infrastructure/persistence/supabase-suscripcion.repository';
import { SupabaseTransaccionPagoRepository } from './infrastructure/persistence/supabase-transaccion-pago.repository';
import { WompiPaymentGatewayAdapter } from './infrastructure/adapters/wompi-payment-gateway.adapter';
import { PAYMENT_GATEWAY } from './domain/repositories/application/ports/out/payment-gateway.port';

@Module({
	imports: [AuthModule],
	controllers: [PaymentsController],
	providers: [
		GenerarLinkPagoUseCase,
		ProcesarWebhookPagoUseCase,
		SupabasePlanRepository,
		SupabaseSuscripcionRepository,
		SupabaseTransaccionPagoRepository,
		WompiPaymentGatewayAdapter,
		{ provide: PLAN_REPOSITORY, useExisting: SupabasePlanRepository },
		{ provide: SUSCRIPCION_REPOSITORY, useExisting: SupabaseSuscripcionRepository },
		{ provide: TRANSACCION_PAGO_REPOSITORY, useExisting: SupabaseTransaccionPagoRepository },
		{ provide: PAYMENT_GATEWAY, useExisting: WompiPaymentGatewayAdapter },
	],
})
export class PaymentsModule {}
