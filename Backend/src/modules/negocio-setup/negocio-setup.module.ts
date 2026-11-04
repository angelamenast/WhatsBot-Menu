import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AgentModule } from '../agent/agent.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ObtenerChecklistNegocioUseCase } from './application/use-cases/obtener-checklist-negocio.use-case';
import { CambiarAtencionAutomaticaUseCase } from './application/use-cases/cambiar-atencion-automatica.use-case';
import { NegociosMeController } from './presentation/controllers/negocios-me.controller';

// Configuración inicial del negocio (TREMIA-104 checklist, TREMIA-71 atención automática).
// Lee datos de varios módulos, por eso vive aparte: business, subscriptions, agent y whatsapp
// no importan este módulo, así no se forman dependencias circulares.
@Module({
  imports: [AuthModule, BusinessModule, SubscriptionsModule, AgentModule, WhatsappModule],
  controllers: [NegociosMeController],
  providers: [ObtenerChecklistNegocioUseCase, CambiarAtencionAutomaticaUseCase],
  exports: [ObtenerChecklistNegocioUseCase],
})
export class NegocioSetupModule {}
