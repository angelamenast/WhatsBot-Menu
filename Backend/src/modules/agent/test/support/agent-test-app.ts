import {
  CanActivate,
  ExecutionContext,
  Global,
  INestApplication,
  Module,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AGENT_CONFIG_REPOSITORY } from '../../domain/repositories/agent-config.repository';
import { BUSINESS_ATTENTION_REPOSITORY } from '../../domain/repositories/business-attention.repository';
import { CATALOG_REPOSITORY } from '../../domain/repositories/catalog.repository';
import { CONVERSATION_HISTORY_REPOSITORY } from '../../domain/repositories/conversation-history.repository';
import { LLM_PORT } from '../../application/ports/out/llm.port';
import { TOKEN_USAGE_PORT } from '../../application/ports/out/token-usage.port';
import { USAGE_QUOTA_PORT } from '../../application/ports/out/usage-quota.port';
import { ORDER_PORT } from '../../application/ports/out/order.port';
import { ProcessCustomerMessageUseCase } from '../../application/use-cases/process-customer-message.use-case';
import { GetAgentConfigUseCase } from '../../application/use-cases/get-agent-config.use-case';
import { UpdateAgentConfigUseCase } from '../../application/use-cases/update-agent-config.use-case';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { ObtenerEstadoSuscripcionUseCase } from '../../../subscriptions/application/use-cases/obtener-estado-suscripcion.use-case';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

const supabaseStub = {
  getClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    from: () => ({ select: () => ({}) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
};

@Global()
@Module({
  providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  exports: [SupabaseService],
})
class GlobalTestSupabaseModule {}

import {
  InMemoryAgentConfigRepository,
  InMemoryBusinessAttentionRepository,
  InMemoryCatalogRepository,
  InMemoryConversationHistoryRepository,
} from './in-memory-repositories';
import {
  ConfigurableLlmAdapter,
  InMemoryOrderAdapter,
  InMemoryTokenUsageAdapter,
  InMemoryUsageQuotaAdapter,
} from './fake-ports';

export interface TestAuthUser {
  id: string;
  email?: string;
}

export class AgentTestApp {
  public app!: INestApplication;
  public moduleFixture!: TestingModule;

  // Repositorios in-memory
  public agentConfigRepo = new InMemoryAgentConfigRepository();
  public businessAttentionRepo = new InMemoryBusinessAttentionRepository();
  public catalogRepo = new InMemoryCatalogRepository();
  public conversationHistoryRepo = new InMemoryConversationHistoryRepository();

  // Puertos y adaptadores falsos
  public llmPort = new ConfigurableLlmAdapter();
  public tokenUsagePort = new InMemoryTokenUsageAdapter();
  public usageQuotaPort = new InMemoryUsageQuotaAdapter();
  public orderPort = new InMemoryOrderAdapter();

  // Estado configurable de autenticación y suscripción
  public currentAuthUser: TestAuthUser | null = { id: 'test-user-1', email: 'test@negocio.com' };
  public subscriptionCanEdit = true;
  public userBusinessMap = new Map<string, { id: string; nombre?: string }>();

  // Casos de uso reales
  public processCustomerMessageUseCase!: ProcessCustomerMessageUseCase;
  public getAgentConfigUseCase!: GetAgentConfigUseCase;
  public updateAgentConfigUseCase!: UpdateAgentConfigUseCase;

  private originalFetch = global.fetch;
  private envBackup: NodeJS.ProcessEnv = {};

  async initialize(): Promise<void> {
    this.envBackup = { ...process.env };

    // Regla 4: Bloqueo de red por defecto
    global.fetch = (() => {
      throw new Error('RED_BLOQUEADA: Las pruebas de integración del módulo no deben realizar llamadas de red externas.');
    }) as unknown as typeof fetch;

    // Negocio por defecto asociado al usuario de pruebas
    this.userBusinessMap.set('test-user-1', { id: 'business-test-1', nombre: 'Negocio de Prueba' });

    const authGuardFake: CanActivate = {
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        const authHeader = req.headers?.authorization;

        // Si se pide explícitamente simular fallo de token o falta de header
        if (!authHeader || !authHeader.startsWith('Bearer ') || !this.currentAuthUser) {
          throw new UnauthorizedException('Token no proporcionado');
        }

        req.user = this.currentAuthUser;
        return true;
      },
    };

    const businessServiceMock = {
      findByUsuario: async (userId: string) => {
        const found = this.userBusinessMap.get(userId);
        return found ? { id: found.id, nombreNegocio: found.nombre ?? 'Negocio' } : null;
      },
    };

    const estadoSuscripcionMock = {
      execute: async () => ({
        puedeEditar: this.subscriptionCanEdit,
      }),
    };

    const agentModulePath = '../../agent.module';
    const { AgentModule } = (await import(agentModulePath)) as { AgentModule: any };

    this.moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        GlobalTestSupabaseModule,
        EventEmitterModule.forRoot(),
        AgentModule,
      ],
    })
      // Sobrescritura de repositorios
      .overrideProvider(AGENT_CONFIG_REPOSITORY)
      .useValue(this.agentConfigRepo)
      .overrideProvider(BUSINESS_ATTENTION_REPOSITORY)
      .useValue(this.businessAttentionRepo)
      .overrideProvider(CATALOG_REPOSITORY)
      .useValue(this.catalogRepo)
      .overrideProvider(CONVERSATION_HISTORY_REPOSITORY)
      .useValue(this.conversationHistoryRepo)
      // Sobrescritura de puertos externos
      .overrideProvider(LLM_PORT)
      .useValue(this.llmPort)
      .overrideProvider(TOKEN_USAGE_PORT)
      .useValue(this.tokenUsagePort)
      .overrideProvider(USAGE_QUOTA_PORT)
      .useValue(this.usageQuotaPort)
      .overrideProvider(ORDER_PORT)
      .useValue(this.orderPort)
      // Sobrescritura de dependencias externas del controlador
      .overrideGuard(SupabaseAuthGuard)
      .useValue(authGuardFake)
      .overrideProvider(BusinessService)
      .useValue(businessServiceMock)
      .overrideProvider(ObtenerEstadoSuscripcionUseCase)
      .useValue(estadoSuscripcionMock)
      .compile();

    this.app = this.moduleFixture.createNestApplication();

    // Regla 3: Replicar main.ts (prefijo 'api' y ValidationPipe con whitelist)
    this.app.setGlobalPrefix('api');
    this.app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await this.app.init();

    // Obtener instancias reales de los casos de uso
    this.processCustomerMessageUseCase = this.moduleFixture.get(ProcessCustomerMessageUseCase);
    this.getAgentConfigUseCase = this.moduleFixture.get(GetAgentConfigUseCase);
    this.updateAgentConfigUseCase = this.moduleFixture.get(UpdateAgentConfigUseCase);
  }

  reset(): void {
    this.agentConfigRepo.clear();
    this.businessAttentionRepo.clear();
    this.catalogRepo.clear();
    this.conversationHistoryRepo.clear();

    this.llmPort.clear();
    this.tokenUsagePort.clear();
    this.usageQuotaPort.clear();
    this.orderPort.clear();

    this.currentAuthUser = { id: 'test-user-1', email: 'test@negocio.com' };
    this.subscriptionCanEdit = true;
    this.userBusinessMap.clear();
    this.userBusinessMap.set('test-user-1', { id: 'business-test-1', nombre: 'Negocio de Prueba' });

    process.env = { ...this.envBackup };
  }

  async close(): Promise<void> {
    global.fetch = this.originalFetch;
    process.env = { ...this.envBackup };
    if (this.app) {
      await this.app.close();
    }
  }
}
