import { Logger } from '@nestjs/common';
import { LlmGenerationError } from '../../../domain/errors/agent.errors';
import type { GenerateReplyParams, GenerateReplyResult, LlmPort } from '../../../application/ports/out/llm.port';
import { buildConversationTurns } from '../../../application/prompt/conversation-turns.builder';
import { parseProposedOrder } from '../../../application/prompt/proposed-order.parser';
import {
  PROPOSE_ORDER_DESCRIPTION,
  PROPOSE_ORDER_PARAMETERS,
  PROPOSE_ORDER_TOOL_NAME,
} from '../../../application/prompt/propose-order.schema';
import { buildSystemPrompt } from '../../../application/prompt/system-prompt.builder';
import type { GeminiClient, GeminiContent, GeminiRequest, GeminiResponse } from './gemini-client';
import type { GeminiConfig } from './gemini-config';

// Cortan la respuesta antes de que sea utilizable: se manejan como fallo (el caso de uso envía el
// texto de contingencia). MAX_TOKENS incluido: un mensaje cortado a mitad no se le envía al cliente.
const FAILED_FINISH_REASONS = new Set([
  'MAX_TOKENS',
  'SAFETY',
  'RECITATION',
  'LANGUAGE',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'MALFORMED_FUNCTION_CALL',
  'UNEXPECTED_TOOL_CALL',
  'TOO_MANY_TOOL_CALLS',
  'OTHER',
]);

const CHARS_PER_TOKEN = 4;

/** Espera antes de reintentar el modelo principal tras un 503 o 429. */
export const RETRY_BACKOFF_MS = 1000;
/** Si al llegar a un reintento o al respaldo queda menos presupuesto que esto, ya no se intenta. */
export const MIN_ATTEMPT_MS = 500;
// Saturación o límite de uso del proveedor: el único caso que merece reintento o respaldo.
// 400, 401, 403 y 404 son configuración inválida (clave, modelo, razonamiento): reintentar no sirve.
const TRANSIENT_STATUSES = new Set([429, 503]);

interface AttemptFailure {
  step: string;
  /** 'HTTP 503', 'timeout', 'sin código' o 'sin tiempo restante': nunca texto del proveedor. */
  code: string;
  transient: boolean;
}

export interface GeminiAdapterOptions {
  /** Espera inyectable (los tests no esperan 1 s de verdad). */
  sleep?: (ms: number) => Promise<void>;
  /** Reloj monotónico en ms, inyectable. */
  clock?: () => number;
}

const toTokenCount = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * LlmPort sobre Gemini (`@google/genai`).
 *
 * Resiliencia: ante 503 o 429 reintenta UNA vez el modelo principal tras 1 s y, si vuelve a fallar,
 * hace un intento con el modelo de respaldo (si está configurado). Cualquier otro error (400, 401,
 * 404, timeout…) corta de inmediato. `config.timeoutMs` es el presupuesto TOTAL: cada intento recibe
 * lo que reste, así que toda la secuencia queda acotada.
 *
 * Los errores del proveedor se envuelven SIEMPRE en LlmGenerationError con un motivo genérico
 * (códigos HTTP, timeout, código de bloqueo): el mensaje original del proveedor no se propaga.
 * Los logs llevan solo modelo, código y latencia; nunca prompts, respuestas ni mensajes de clientes.
 */
export class GeminiLlmAdapter implements LlmPort {
  private readonly logger = new Logger(GeminiLlmAdapter.name);
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clock: () => number;

  constructor(
    private readonly client: GeminiClient,
    private readonly config: GeminiConfig,
    /** Reloj inyectable (la fecha y hora van en el system prompt). */
    private readonly now: () => Date = () => new Date(),
    options: GeminiAdapterOptions = {},
  ) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.clock = options.clock ?? (() => performance.now());
  }

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const { prompt, productRefs } = buildSystemPrompt(params, this.now());
    const contents = this.toContents(params);

    const { response, model } = await this.callWithFallback(prompt, contents);

    const candidate = response.candidates?.[0];

    if (response.promptFeedback?.blockReason) {
      throw new LlmGenerationError(`solicitud bloqueada por el proveedor (${response.promptFeedback.blockReason})`);
    }
    if (!candidate) {
      throw new LlmGenerationError('el proveedor no devolvió ninguna respuesta');
    }
    if (candidate.finishReason && FAILED_FINISH_REASONS.has(candidate.finishReason)) {
      throw new LlmGenerationError(`respuesta no utilizable del proveedor (${candidate.finishReason})`);
    }

    // Se leen las partes a mano: el getter `text` del SDK escribe un aviso por consola si hay una
    // llamada a herramienta, y las partes de razonamiento no son texto para el cliente.
    const parts = candidate.content?.parts ?? [];
    const text = parts
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
      .trim();

    let proposedOrder: GenerateReplyResult['proposedOrder'] = null;
    let calledTool = false;
    for (const part of parts) {
      if (part.functionCall?.name !== PROPOSE_ORDER_TOOL_NAME) {
        continue;
      }
      calledTool = true;
      proposedOrder = parseProposedOrder(part.functionCall.args, productRefs);
      if (proposedOrder) {
        break;
      }
    }

    // Con pedido válido el backend descarta el texto del modelo; sin pedido, el texto es la respuesta.
    if (!proposedOrder && !text) {
      throw new LlmGenerationError(
        calledTool ? 'el modelo propuso un pedido inválido' : 'el proveedor devolvió una respuesta vacía',
      );
    }

    // `model` es el que REALMENTE respondió (puede ser el de respaldo): el caso de uso lo registra.
    return { text, proposedOrder, model, ...this.countTokens(response, prompt, contents, text) };
  }

  /** Principal → reintento del principal (1 s) → respaldo, según lo permitan los errores y el presupuesto. */
  private async callWithFallback(
    prompt: string,
    contents: GeminiContent[],
  ): Promise<{ response: GeminiResponse; model: string }> {
    const startedAt = this.clock();
    const remaining = () => this.config.timeoutMs - (this.clock() - startedAt);

    const steps = [
      { label: 'principal', model: this.config.model, delayMs: 0 },
      { label: 'reintento', model: this.config.model, delayMs: RETRY_BACKOFF_MS },
      ...(this.config.fallbackModel
        ? [{ label: 'respaldo', model: this.config.fallbackModel, delayMs: 0 }]
        : []),
    ];
    const failures: AttemptFailure[] = [];

    for (const [index, step] of steps.entries()) {
      if (step.delayMs > 0) {
        await this.sleep(step.delayMs);
      }

      const budget = remaining();
      if (index > 0 && budget < MIN_ATTEMPT_MS) {
        failures.push({ step: step.label, code: 'sin tiempo restante', transient: false });
        break;
      }

      const signal = AbortSignal.timeout(Math.max(1, Math.ceil(budget)));
      const attemptStartedAt = this.clock();

      try {
        const response = await this.client.models.generateContent(
          this.buildRequest(step.model, prompt, contents, signal),
        );
        this.logSuccess(step.label, step.model, this.clock() - attemptStartedAt);
        return { response, model: step.model };
      } catch (error) {
        const failure = this.classify(error, signal, step.label);
        failures.push(failure);
        this.logger.warn(
          `Gemini: intento ${step.label} fallido (modelo=${step.model}, código=${failure.code}, latencia=${Math.round(
            this.clock() - attemptStartedAt,
          )} ms)`,
        );

        if (!failure.transient) {
          break;
        }
      }
    }

    throw new LlmGenerationError(this.describeFailures(failures));
  }

  private buildRequest(model: string, prompt: string, contents: GeminiContent[], signal: AbortSignal): GeminiRequest {
    return {
      model,
      contents,
      config: {
        systemInstruction: prompt,
        tools: [
          {
            functionDeclarations: [
              {
                name: PROPOSE_ORDER_TOOL_NAME,
                description: PROPOSE_ORDER_DESCRIPTION,
                parametersJsonSchema: PROPOSE_ORDER_PARAMETERS,
              },
            ],
          },
        ],
        maxOutputTokens: this.config.maxOutputTokens,
        thinkingConfig: { thinkingLevel: this.config.thinkingLevel.toUpperCase() },
        abortSignal: signal,
      },
    };
  }

  /** Roles de Gemini; `contents` debe empezar por el usuario (el historial puede empezar por el agente). */
  private toContents(params: GenerateReplyParams): GeminiContent[] {
    const turns = buildConversationTurns(params.history, params.customerMessage);
    const firstUser = turns.findIndex((turn) => turn.role === 'user');

    return turns.slice(firstUser).map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
  }

  /**
   * Entrada = prompt + herramientas; salida = candidatos + razonamiento (el razonamiento se factura
   * como salida). Los tokens en caché ya vienen incluidos en promptTokenCount.
   */
  private countTokens(
    response: GeminiResponse,
    prompt: string,
    contents: GeminiContent[],
    text: string,
  ): { tokensInput: number; tokensOutput: number } {
    const usage = response.usageMetadata;

    if (!usage) {
      this.logger.warn('Gemini no devolvió usageMetadata: los tokens de este turno se estiman por caracteres');
      const inputChars = prompt.length + contents.reduce((sum, content) => sum + content.parts[0].text.length, 0);
      return {
        tokensInput: Math.ceil(inputChars / CHARS_PER_TOKEN),
        tokensOutput: Math.ceil(text.length / CHARS_PER_TOKEN),
      };
    }

    return {
      tokensInput: toTokenCount(usage.promptTokenCount) + toTokenCount(usage.toolUsePromptTokenCount),
      tokensOutput: toTokenCount(usage.candidatesTokenCount) + toTokenCount(usage.thoughtsTokenCount),
    };
  }

  private classify(error: unknown, signal: AbortSignal, step: string): AttemptFailure {
    const name = error instanceof Error ? error.name : '';

    if (signal.aborted || name === 'AbortError' || name === 'TimeoutError') {
      return { step, code: 'timeout', transient: false };
    }

    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      return { step, code: `HTTP ${status}`, transient: TRANSIENT_STATUSES.has(status) };
    }

    return { step, code: 'sin código', transient: false };
  }

  private describeFailures(failures: AttemptFailure[]): string {
    if (failures.length === 1) {
      const [only] = failures;
      if (only.code === 'timeout') {
        return `tiempo de espera agotado (${this.config.timeoutMs} ms)`;
      }
      return only.code.startsWith('HTTP') ? `error del proveedor (${only.code})` : 'error del proveedor';
    }

    return `fallaron ${failures.length} intentos del proveedor (${failures
      .map((failure) => `${failure.step}: ${failure.code}`)
      .join('; ')})`;
  }

  private logSuccess(step: string, model: string, latencyMs: number): void {
    const detail = `modelo=${model}, latencia=${Math.round(latencyMs)} ms`;
    if (step === 'principal') {
      this.logger.debug(`Gemini: respuesta del modelo principal (${detail})`);
    } else {
      this.logger.log(`Gemini: respondió el intento ${step} (${detail})`);
    }
  }
}
