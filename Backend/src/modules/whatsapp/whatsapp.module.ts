import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';

import { MESSAGING_PORT } from './application/ports/out/messaging.port';
import { FakeMessagingProvider } from './infrastructure/adapters/fake-messaging.adapter';
import { PROVISIONING_PORT } from './application/ports/out/provisioning.port';
import { FakeProvisioningProvider } from './infrastructure/adapters/fake-provisioning.adapter';
import { PLAN_STATUS_PORT } from './application/ports/out/plan-status.port';
import { FakePlanStatusProvider } from './infrastructure/adapters/fake-plan-status.adapter';
import { AGENT_DISPATCH_PORT } from './application/ports/out/agent-dispatch.port';
import { FakeAgentDispatchProvider } from './infrastructure/adapters/fake-agent-dispatch.adapter';

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
import { ConnectWhatsappUseCase } from './application/use-cases/connect-whatsapp.use-case';
import { HandleStatusCallbackUseCase } from './application/use-cases/handle-status-callback.use-case';

import { TwilioWebhookController } from './presentation/controllers/twilio-webhook.controller';
import { TwilioStatusCallbackController } from './presentation/controllers/twilio-status-callback.controller';
import { WhatsappOnboardingController } from './presentation/controllers/whatsapp-onboarding.controller';

@Module({
  imports: [ConfigModule, AuthModule, BusinessModule],
  controllers: [TwilioWebhookController, TwilioStatusCallbackController, WhatsappOnboardingController],
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
          case 'twilio':
            throw new Error('TwilioMessagingAdapter no implementado todavía');
          default:
            throw new Error(`MESSAGING_PROVIDER inválido: "${provider}". Usa "fake" o "twilio".`);
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
          case 'twilio':
            throw new Error('TwilioProvisioningAdapter no implementado todavía');
          default:
            throw new Error(`PROVISIONING_PROVIDER inválido: "${provider}". Usa "fake" o "twilio".`);
        }
      },
    },

    FakePlanStatusProvider,
    {
      provide: PLAN_STATUS_PORT,
      inject: [ConfigService, FakePlanStatusProvider],
      useFactory: (configService: ConfigService, fakePlanStatusProvider: FakePlanStatusProvider) => {
        const provider = configService.get<string>('PLAN_STATUS_PROVIDER') ?? 'fake';

        switch (provider) {
          case 'fake':
            return fakePlanStatusProvider;
          default:
            throw new Error(
              `PLAN_STATUS_PROVIDER inválido: "${provider}". Por ahora solo está implementado "fake".`,
            );
        }
      },
    },

    FakeAgentDispatchProvider,
    {
      provide: AGENT_DISPATCH_PORT,
      inject: [ConfigService, FakeAgentDispatchProvider],
      useFactory: (configService: ConfigService, fakeAgentDispatchProvider: FakeAgentDispatchProvider) => {
        const provider = configService.get<string>('AGENT_DISPATCH_PROVIDER') ?? 'fake';

        switch (provider) {
          case 'fake':
            return fakeAgentDispatchProvider;
          default:
            throw new Error(
              `AGENT_DISPATCH_PROVIDER inválido: "${provider}". Por ahora solo está implementado "fake".`,
            );
        }
      },
    },

    { provide: WHATSAPP_CONNECTION_REPOSITORY, useClass: SupabaseWhatsappConnectionRepository },
    { provide: PROCESSED_MESSAGE_REPOSITORY, useClass: SupabaseProcessedMessageRepository },
    { provide: CONVERSATION_REPOSITORY, useClass: SupabaseConversationRepository },
    { provide: MESSAGE_REPOSITORY, useClass: SupabaseMessageRepository },

    HandleIncomingMessageUseCase,
    SendMessageUseCase,
    ConnectWhatsappUseCase,
    HandleStatusCallbackUseCase,
  ],
  exports: [MESSAGING_PORT, PROVISIONING_PORT, PLAN_STATUS_PORT, AGENT_DISPATCH_PORT],
})
export class WhatsappModule {}
