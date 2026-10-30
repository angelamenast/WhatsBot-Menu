import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { AgentModule } from '../agent/agent.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SubscriptionPlanStatusAdapter } from '../subscriptions/infrastructure/adapters/subscription-plan-status.adapter';

import { MESSAGING_PORT } from './application/ports/out/messaging.port';
import { FakeMessagingProvider } from './infrastructure/adapters/fake-messaging.adapter';
import { PROVISIONING_PORT } from './application/ports/out/provisioning.port';
import { FakeProvisioningProvider } from './infrastructure/adapters/fake-provisioning.adapter';
import { loadMetaConfig } from './infrastructure/adapters/meta-config';
import { MetaGraphClient } from './infrastructure/adapters/meta-graph.client';
import { MetaMessagingAdapter } from './infrastructure/adapters/meta-messaging.adapter';
import { MetaProvisioningAdapter } from './infrastructure/adapters/meta-provisioning.adapter';
import { PLAN_STATUS_PORT } from './application/ports/out/plan-status.port';
import { FakePlanStatusProvider } from './infrastructure/adapters/fake-plan-status.adapter';
import { AGENT_DISPATCH_PORT } from './application/ports/out/agent-dispatch.port';
import { FakeAgentDispatchProvider } from './infrastructure/adapters/fake-agent-dispatch.adapter';
import { AgentDispatchAdapter } from './infrastructure/adapters/agent-dispatch.adapter';

import { WHATSAPP_CONNECTION_REPOSITORY } from './domain/repositories/whatsapp-connection.repository';
import { SupabaseWhatsappConnectionRepository } from './infrastructure/persistence/supabase-whatsapp-connection.repository';
import { PROCESSED_MESSAGE_REPOSITORY } from './domain/repositories/processed-message.repository';
import { SupabaseProcessedMessageRepository } from './infrastructure/persistence/supabase-processed-message.repository';
import { CONVERSATION_REPOSITORY } from './domain/repositories/conversation.repository';
import { SupabaseConversationRepository } from './infrastructure/persistence/supabase-conversation.repository';
import { MESSAGE_REPOSITORY } from './domain/repositories/message.repository';
import { SupabaseMessageRepository } from './infrastructure/persistence/supabase-message.repository';

import { HandleIncomingMessageUseCase } from './application/use-cases/handle-incoming-message.use-case';
import { SendMessageUseCase } from './application/use-cases/send-message.use-case';
import { CloseConversationUseCase } from './application/use-cases/close-conversation.use-case';
import { ConnectWhatsappUseCase } from './application/use-cases/connect-whatsapp.use-case';
import { HandleStatusCallbackUseCase } from './application/use-cases/handle-status-callback.use-case';

import { OrderStatusChangedListener } from './presentation/listeners/order-status-changed.listener';
import { MetaWebhookController } from './presentation/controllers/meta-webhook.controller';
import { WhatsappOnboardingController } from './presentation/controllers/whatsapp-onboarding.controller';

@Module({
  imports: [ConfigModule, AuthModule, BusinessModule, AgentModule, SubscriptionsModule],
  controllers: [MetaWebhookController, WhatsappOnboardingController],
  providers: [
    FakeMessagingProvider,
    {
      provide: MESSAGING_PORT,
      inject: [ConfigService, FakeMessagingProvider],
      useFactory: (configService: ConfigService, fakeMessagingProvider: FakeMessagingProvider) => {
        const provider = configService.get<string>('MESSAGING_PROVIDER') ?? 'fake';

        switch (provider) {
          case 'fake':
            return fakeMessagingProvider;
          case 'meta':
            return new MetaMessagingAdapter(new MetaGraphClient(loadMetaConfig(configService)));
          default:
            throw new Error(`MESSAGING_PROVIDER inválido: "${provider}". Usa "fake" o "meta".`);
        }
      },
    },

    FakeProvisioningProvider,
    {
      provide: PROVISIONING_PORT,
      inject: [ConfigService, FakeProvisioningProvider],
      useFactory: (configService: ConfigService, fakeProvisioningProvider: FakeProvisioningProvider) => {
        const provider = configService.get<string>('PROVISIONING_PROVIDER') ?? 'fake';

        switch (provider) {
          case 'fake':
            return fakeProvisioningProvider;
          case 'meta':
            return new MetaProvisioningAdapter(new MetaGraphClient(loadMetaConfig(configService)));
          default:
            throw new Error(`PROVISIONING_PROVIDER inválido: "${provider}". Usa "fake" o "meta".`);
        }
      },
    },

    FakePlanStatusProvider,
    {
      provide: PLAN_STATUS_PORT,
      inject: [ConfigService, FakePlanStatusProvider, SubscriptionPlanStatusAdapter],
      useFactory: (
        configService: ConfigService,
        fakePlanStatusProvider: FakePlanStatusProvider,
        subscriptionPlanStatusAdapter: SubscriptionPlanStatusAdapter,
      ) => {
        const provider = configService.get<string>('PLAN_STATUS_PROVIDER') ?? 'fake';

        switch (provider) {
          case 'fake':
            return fakePlanStatusProvider;
          case 'subscriptions':
            return subscriptionPlanStatusAdapter;
          default:
            throw new Error(`PLAN_STATUS_PROVIDER inválido: "${provider}". Usa "fake" o "subscriptions".`);
        }
      },
    },

    FakeAgentDispatchProvider,
    AgentDispatchAdapter,
    {
      provide: AGENT_DISPATCH_PORT,
      inject: [ConfigService, FakeAgentDispatchProvider, AgentDispatchAdapter],
      useFactory: (
        configService: ConfigService,
        fakeAgentDispatchProvider: FakeAgentDispatchProvider,
        agentDispatchAdapter: AgentDispatchAdapter,
      ) => {
        const provider = configService.get<string>('AGENT_DISPATCH_PROVIDER') ?? 'fake';

        switch (provider) {
          case 'fake':
            return fakeAgentDispatchProvider;
          case 'agent':
            return agentDispatchAdapter;
          default:
            throw new Error(`AGENT_DISPATCH_PROVIDER inválido: "${provider}". Usa "fake" o "agent".`);
        }
      },
    },

    { provide: WHATSAPP_CONNECTION_REPOSITORY, useClass: SupabaseWhatsappConnectionRepository },
    { provide: PROCESSED_MESSAGE_REPOSITORY, useClass: SupabaseProcessedMessageRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: SupabaseConversationRepository },
    { provide: MESSAGE_REPOSITORY, useClass: SupabaseMessageRepository },

    HandleIncomingMessageUseCase,
    SendMessageUseCase,
    CloseConversationUseCase,
    ConnectWhatsappUseCase,
    HandleStatusCallbackUseCase,

    OrderStatusChangedListener,
  ],
  exports: [MESSAGING_PORT, PROVISIONING_PORT, PLAN_STATUS_PORT, AGENT_DISPATCH_PORT],
})
export class WhatsappModule {}
