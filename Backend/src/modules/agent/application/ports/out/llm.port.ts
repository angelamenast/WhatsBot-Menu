import { AgentRegionalStyle, AgentTone } from '../../../domain/enums/agent-style';
import { CatalogItem } from '../../../domain/repositories/catalog.repository';
import { HistoryMessage } from '../../../domain/repositories/conversation-history.repository';

export interface GenerateReplyParams {
  businessName: string;
  personality: string | null;
  /** Tono efectivo (el configurado o el por defecto). */
  tone: AgentTone;
  /** Estilo regional efectivo (el configurado o el por defecto). */
  regionalStyle: AgentRegionalStyle;
  catalog: CatalogItem[];
  history: HistoryMessage[];
  customerMessage: string;
  /** Horario de atención tal como lo guardó el dueño (formato libre); null si no lo configuró. */
  businessHours: Record<string, unknown> | null;
  /**
   * true si es el primer mensaje de la conversación. En ese caso el caso de uso antepone la
   * bienvenida a la respuesta, y el modelo no debe repetir el saludo.
   */
  isFirstMessage: boolean;
}

/** Pedido que el modelo propone; el backend decide si se crea (precios y totales los pone el backend). */
export interface ProposedOrder {
  items: { productId: string; quantity: number }[];
}

export interface GenerateReplyResult {
  text: string;
  /** null cuando el modelo no propone ningún pedido en este turno. */
  proposedOrder: ProposedOrder | null;
  tokensInput: number;
  tokensOutput: number;
}

export interface LlmPort {
  generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult>;
}

export const LLM_PORT = Symbol('LlmPort');