import { CatalogItem } from '../../../domain/repositories/catalog.repository';
import { HistoryMessage } from '../../../domain/repositories/conversation-history.repository';

export interface GenerateReplyParams {
  personality: string | null;
  tone: string | null;
  catalog: CatalogItem[];
  history: HistoryMessage[];
  customerMessage: string;
}

export interface GenerateReplyResult {
  text: string;
  tokensInput: number;
  tokensOutput: number;
}

export interface LlmPort {
  generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult>;
}

export const LLM_PORT = Symbol('LlmPort');