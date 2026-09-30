import { Injectable, Logger } from '@nestjs/common';
import { GenerateReplyParams, GenerateReplyResult, LlmPort } from '../../application/ports/out/llm.port';

@Injectable()
export class FakeLlmProvider implements LlmPort {
  private readonly logger = new Logger(FakeLlmProvider.name);

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    this.logger.log(
      `[FakeLlmProvider] Mensaje: "${params.customerMessage}" | catálogo: ${params.catalog.length} items | historial: ${params.history.length} mensajes`,
    );

    const text = `(respuesta simulada) Recibí tu mensaje: "${params.customerMessage}". Tenemos ${params.catalog.length} productos disponibles.`;

    return {
      text,
      tokensInput: Math.ceil(params.customerMessage.length / 4),
      tokensOutput: Math.ceil(text.length / 4),
    };
  }
}