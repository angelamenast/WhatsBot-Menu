import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';

import { AGENT_CONFIG_REPOSITORY } from './domain/repositories/agent-config.repository';
import { SupabaseAgentConfigRepository } from './infrastructure/persistence/supabase-agent-config.repository';
import { CATALOG_REPOSITORY } from './domain/repositories/catalog.repository';
import { SupabaseCatalogRepository } from './infrastructure/persistence/supabase-catalog.repository';
import { CONVERSATION_HISTORY_REPOSITORY } from './domain/repositories/conversation-history.repository';
import { SupabaseConversationHistoryRepository } from './infrastructure/persistence/supabase-conversation-history.repository';

import { LLM_PORT } from './application/ports/out/llm.port';
import { FakeLlmProvider } from './infrastructure/adapters/fake-llm.adapter';
// import { OpenAiLlmAdapter } from './infrastructure/adapters/openai-llm.adapter'; // próximo paso

import { TOKEN_USAGE_PORT } from './application/ports/out/token-usage.port';
import { SupabaseTokenUsageAdapter } from './infrastructure/adapters/supabase-token-usage.adapter';

import { ORDER_PORT } from './application/ports/out/order.port';
import { FakeOrderProvider } from './infrastructure/adapters/fake-order.adapter';
import { SupabaseOrderAdapter } from './infrastructure/adapters/supabase-order.adapter';

import { ProcessCustomerMessageUseCase } from './application/use-cases/process-customer-message.use-case';
import { GetAgentConfigUseCase } from './application/use-cases/get-agent-config.use-case';
import { UpdateAgentConfigUseCase } from './application/use-cases/update-agent-config.use-case';
import { AgentConfigController } from './presentation/controllers/agent-config.controller';

@Module({
  imports: [ConfigModule, AuthModule, BusinessModule],
  controllers: [AgentConfigController],
  providers: [
    { provide: AGENT_CONFIG_REPOSITORY, useClass: SupabaseAgentConfigRepository },
    { provide: CATALOG_REPOSITORY, useClass: SupabaseCatalogRepository },
    { provide: CONVERSATION_HISTORY_REPOSITORY, useClass: SupabaseConversationHistoryRepository },

    FakeLlmProvider,
    {
      provide: LLM_PORT,
      inject: [ConfigService, FakeLlmProvider],
      useFactory: (configService: ConfigService, fakeLlmProvider: FakeLlmProvider) => {
        const provider = configService.get<string>('LLM_PROVIDER') ?? 'fake';
        switch (provider) {
          case 'fake':
            return fakeLlmProvider;
          case 'openai':
            throw new Error('OpenAiLlmAdapter no implementado todavía');
          default:
            throw new Error(`LLM_PROVIDER inválido: "${provider}". Usa "fake" u "openai".`);
        }
      },
    },

    { provide: TOKEN_USAGE_PORT, useClass: SupabaseTokenUsageAdapter },

    FakeOrderProvider,
    SupabaseOrderAdapter,
    {
      provide: ORDER_PORT,
      inject: [ConfigService, FakeOrderProvider, SupabaseOrderAdapter],
      useFactory: (
        configService: ConfigService,
        fakeOrderProvider: FakeOrderProvider,
        supabaseOrderAdapter: SupabaseOrderAdapter,
      ) => {
        const provider = configService.get<string>('ORDER_PROVIDER') ?? 'fake';
        switch (provider) {
          case 'fake':
            return fakeOrderProvider;
          case 'supabase':
            return supabaseOrderAdapter;
          default:
            throw new Error(`ORDER_PROVIDER inválido: "${provider}". Usa "fake" o "supabase".`);
        }
      },
    },

    ProcessCustomerMessageUseCase,
    GetAgentConfigUseCase,
    UpdateAgentConfigUseCase,
  ],
  // ProcessCustomerMessageUseCase se exporta para que WhatsappModule lo use como
  // implementación real de AGENT_DISPATCH_PORT en su propio wiring.
  exports: [ProcessCustomerMessageUseCase],
})
export class AgentModule {}