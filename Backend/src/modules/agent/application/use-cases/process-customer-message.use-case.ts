import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AGENT_CONFIG_REPOSITORY } from '../../domain/repositories/agent-config.repository';
import type { CatalogRepository } from '../../domain/repositories/catalog.repository';
import { CATALOG_REPOSITORY } from '../../domain/repositories/catalog.repository';
import type { BusinessAttentionRepository } from '../../domain/repositories/business-attention.repository';
import { BUSINESS_ATTENTION_REPOSITORY } from '../../domain/repositories/business-attention.repository';
import type { ConversationHistoryRepository } from '../../domain/repositories/conversation-history.repository';
import { CONVERSATION_HISTORY_REPOSITORY } from '../../domain/repositories/conversation-history.repository';
import type { LlmPort } from '../ports/out/llm.port';
import { LLM_PORT } from '../ports/out/llm.port';
import type { TokenUsagePort } from '../ports/out/token-usage.port';
import { TOKEN_USAGE_PORT } from '../ports/out/token-usage.port';
import type { UsageQuotaPort } from '../ports/out/usage-quota.port';
import { USAGE_QUOTA_PORT } from '../ports/out/usage-quota.port';

import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { IncomingMessageNotPersistedError } from '../../domain/errors/agent.errors';
import type { ProcessCustomerMessageCommand } from '../dto/process-customer-message.command';
import type { ProcessCustomerMessageResult } from '../dto/process-customer-message.result';
import { DEFAULT_UNAVAILABLE_MESSAGE, FALLBACK_RESPONSE_TEXT } from '../constants/agent-messages';

const HISTORY_MESSAGES_LIMIT = 10;

@Injectable()
export class ProcessCustomerMessageUseCase {
  private readonly logger = new Logger(ProcessCustomerMessageUseCase.name);

  constructor(
    @Inject(AGENT_CONFIG_REPOSITORY)
    private readonly agentConfigRepository: AgentConfigRepository,
    @Inject(BUSINESS_ATTENTION_REPOSITORY)
    private readonly businessAttentionRepository: BusinessAttentionRepository,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepository: CatalogRepository,
    @Inject(CONVERSATION_HISTORY_REPOSITORY)
    private readonly conversationHistoryRepository: ConversationHistoryRepository,
    @Inject(LLM_PORT) private readonly llmPort: LlmPort,
    @Inject(TOKEN_USAGE_PORT) private readonly tokenUsagePort: TokenUsagePort,
    @Inject(USAGE_QUOTA_PORT) private readonly usageQuotaPort: UsageQuotaPort,
  ) {}

  /**
   * PRECONDICIÓN (no negociable): el mensaje entrante actual del cliente debe estar YA
   * PERSISTIDO en `mensajes` antes de invocar este caso de uso.
   *
   * Este caso de uso lo asume en dos lugares y no hay otra señal que lo garantice:
   *  - `isFirstMessage` (RF-10, bienvenida) se calcula como `count === 1`: el "1" es el
   *    mensaje actual ya persistido.
   *  - `findRecentByConversationId` descarta la fila más reciente con `slice(1)` porque
   *    esa fila ES el mensaje actual (se pasa aparte como `customerMessage`).
   * Si se invoca antes de persistir, la bienvenida sale mal y el historial se corrompe.
   * Por eso, `count === 0` se trata como violación de la precondición y lanza.
   *
   * Devuelve null cuando NO se debe responder al cliente (negocio no activo o cuota de tokens agotada).
   * Orden de guardas (el plan vencido lo resuelve whatsapp antes de llegar aquí):
   * negocio no activo → null; atención automática desactivada → mensaje de no
   * disponibilidad (sin LLM, sin cuota, sin tokens, sin bienvenida); cuota agotada → null;
   * luego el flujo normal.
   */
  async execute(command: ProcessCustomerMessageCommand): Promise<ProcessCustomerMessageResult | null> {
    const [storedConfig, attention] = await Promise.all([
      this.agentConfigRepository.findByBusinessId(command.businessId),
      this.businessAttentionRepository.getStatus(command.businessId),
    ]);
    const config = storedConfig ?? AgentConfig.default(command.businessId);

    if (!attention.businessActive) {
      return null;
    }

    if (!attention.autoAttentionActive) {
      return { responseText: config.unavailableMessage ?? DEFAULT_UNAVAILABLE_MESSAGE };
    }

    // RNF-08: sin cuota de tokens no se invoca al LLM ni se responde.
    if (!(await this.usageQuotaPort.hasQuota(command.businessId))) {
      this.logger.warn(
        `Cuota de tokens agotada: el agente no responde (negocio ${command.businessId}, conversación ${command.conversationId})`,
      );
      return null;
    }

    const totalMessages = await this.conversationHistoryRepository.countByConversationId(
      command.conversationId,
    );

    if (totalMessages === 0) {
      throw new IncomingMessageNotPersistedError(command.conversationId);
    }

    const isFirstMessage = totalMessages === 1;

    const [catalog, history] = await Promise.all([
      this.catalogRepository.findByBusinessId(command.businessId),
      this.conversationHistoryRepository.findRecentByConversationId(
        command.conversationId,
        HISTORY_MESSAGES_LIMIT,
      ),
    ]);

    let responseText: string;
    let usage: { tokensInput: number; tokensOutput: number } | null = null;

    try {
      const generated = await this.llmPort.generateReply({
        personality: config.personality,
        tone: config.effectiveTone,
        regionalStyle: config.effectiveRegionalStyle,
        catalog,
        history,
        customerMessage: command.message,
      });

      responseText = generated.text;
      usage = { tokensInput: generated.tokensInput, tokensOutput: generated.tokensOutput };
    } catch (error) {
      this.logger.error(
        `Fallo al generar respuesta del agente para el negocio ${command.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // No propagamos: el cliente siempre debe recibir algo, aunque sea un mensaje de contingencia.
      responseText = FALLBACK_RESPONSE_TEXT;
    }

    // Bloque independiente del anterior: registrar consumo NUNCA debe descartar una
    // respuesta del LLM ya generada. Si falla, se loguea y se sigue.
    if (usage) {
      try {
        await this.tokenUsagePort.record({
          businessId: command.businessId,
          conversationId: command.conversationId,
          messageId: command.messageId,
          tokensInput: usage.tokensInput,
          tokensOutput: usage.tokensOutput,
        });
      } catch (error) {
        this.logger.error(
          `Fallo al registrar el consumo de tokens del negocio ${command.businessId} (la respuesta se entrega igual): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (isFirstMessage && config.welcomeMessage) {
      responseText = `${config.welcomeMessage}\n\n${responseText}`;
    }

    return { responseText };
  }
}
