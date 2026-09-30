import { Inject, Injectable, Logger } from '@nestjs/common';

// Import de SOLO TIPO desde whatsapp: no arrastra WhatsappModule en tiempo de
// ejecución, solo el contrato que este caso de uso debe cumplir.
import type {
  AgentDispatchCommand,
  AgentDispatchPort,
  AgentDispatchResult,
} from '../../../whatsapp/application/ports/out/agent-dispatch.port';

import type { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AGENT_CONFIG_REPOSITORY } from '../../domain/repositories/agent-config.repository';
import type { CatalogRepository } from '../../domain/repositories/catalog.repository';
import { CATALOG_REPOSITORY } from '../../domain/repositories/catalog.repository';
import type { ConversationHistoryRepository } from '../../domain/repositories/conversation-history.repository';
import { CONVERSATION_HISTORY_REPOSITORY } from '../../domain/repositories/conversation-history.repository';
import type { LlmPort } from '../ports/out/llm.port';
import { LLM_PORT } from '../ports/out/llm.port';
import type { TokenUsagePort } from '../ports/out/token-usage.port';
import { TOKEN_USAGE_PORT } from '../ports/out/token-usage.port';

import { AgentConfig } from '../../domain/entities/agent-config.entity';

const HISTORY_MESSAGES_LIMIT = 10;

@Injectable()
export class ProcessCustomerMessageUseCase implements AgentDispatchPort {
  private readonly logger = new Logger(ProcessCustomerMessageUseCase.name);

  constructor(
    @Inject(AGENT_CONFIG_REPOSITORY)
    private readonly agentConfigRepository: AgentConfigRepository,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepository: CatalogRepository,
    @Inject(CONVERSATION_HISTORY_REPOSITORY)
    private readonly conversationHistoryRepository: ConversationHistoryRepository,
    @Inject(LLM_PORT) private readonly llmPort: LlmPort,
    @Inject(TOKEN_USAGE_PORT) private readonly tokenUsagePort: TokenUsagePort,
  ) {}

  async dispatch(command: AgentDispatchCommand): Promise<AgentDispatchResult> {
    const config =
      (await this.agentConfigRepository.findByBusinessId(command.businessId)) ??
      AgentConfig.default(command.businessId);

    // Al llegar aquí, whatsapp ya persistió el mensaje entrante (ver handle-incoming-
    // message.use-case.ts), así que el conteo ya incluye el mensaje actual.
    const totalMessages =
      await this.conversationHistoryRepository.countByConversationId(
        command.conversationId,
      );
    const isFirstMessage = totalMessages <= 1;

    const [catalog, history] = await Promise.all([
      this.catalogRepository.findAvailableByBusinessId(command.businessId),
      this.conversationHistoryRepository.findRecentByConversationId(
        command.conversationId,
        HISTORY_MESSAGES_LIMIT,
      ),
    ]);

    let responseText: string;

    try {
      const generated = await this.llmPort.generateReply({
        personality: config.personality,
        tone: config.tone,
        catalog,
        history,
        customerMessage: command.message,
      });

      responseText = generated.text;

      await this.tokenUsagePort.record({
        businessId: command.businessId,
        conversationId: command.conversationId,
        tokensInput: generated.tokensInput,
        tokensOutput: generated.tokensOutput,
      });
    } catch (error) {
      this.logger.error(
        `Fallo al generar respuesta del agente para el negocio ${command.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // No propagamos: whatsapp siempre debe poder enviar algo al cliente, aunque
      // sea un mensaje de contingencia, en vez de dejar la conversación sin respuesta.
      responseText =
        'Estamos teniendo un inconveniente para responderte en este momento. Intenta de nuevo en unos minutos.';
    }

    if (isFirstMessage && config.welcomeMessage) {
      responseText = `${config.welcomeMessage}\n\n${responseText}`;
    }

    return { responseText };
  }
}
