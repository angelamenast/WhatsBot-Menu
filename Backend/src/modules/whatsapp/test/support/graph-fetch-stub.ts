import { jest } from '@jest/globals';

export const GRAPH_API_VERSION = 'v25.0';
export const GRAPH_ACCESS_TOKEN = 'EAAB-token-de-prueba';

export const graphMessagesUrl = (phoneNumberId: string): string =>
  `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

export interface RecordedGraphCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal | null | undefined;
}

type Responder = () => Promise<Response>;

/**
 * Sustituye `globalThis.fetch` (el cliente de Meta usa fetch nativo). Por defecto LANZA ante cualquier
 * URL que la prueba no haya declarado: así una llamada de red inesperada nunca sale a internet ni
 * pasa desapercibida. Como los casos de uso tragan los errores de envío, cada llamada inesperada
 * se registra en `unexpected` y `assertNoUnexpectedCalls()` (que el bootstrap ejecuta al cerrar)
 * hace fallar la prueba.
 */
export class GraphFetchStub {
  readonly calls: RecordedGraphCall[] = [];
  readonly unexpected: string[] = [];

  private readonly queues = new Map<string, Responder[]>();
  private spy: jest.SpiedFunction<typeof fetch> | null = null;

  install(): void {
    this.spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = (init?.headers ?? {}) as Record<string, string>;

      this.calls.push({
        url,
        method: init?.method,
        headers,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body,
        signal: init?.signal,
      });

      const responder = this.queues.get(url)?.shift();

      if (!responder) {
        this.unexpected.push(url);
        throw new Error(`fetch inesperado en la prueba (sin red real): ${url}`);
      }

      return responder();
    });
  }

  restore(): void {
    this.spy?.mockRestore();
    this.spy = null;
  }

  /** Declara la siguiente respuesta (una por llamada esperada) para la URL dada. */
  respond(url: string, responder: Responder): this {
    const queue = this.queues.get(url) ?? [];
    queue.push(responder);
    this.queues.set(url, queue);
    return this;
  }

  respondJson(url: string, body: unknown, status = 200): this {
    return this.respond(url, async () => jsonResponse(body, status));
  }

  /** Error de la Graph API con la forma `{ error: { message, code, fbtrace_id } }`. */
  respondGraphError(
    url: string,
    status: number,
    error: { message: string; code?: number; fbtrace_id?: string; type?: string },
  ): this {
    return this.respondJson(url, { error }, status);
  }

  respondRejecting(url: string, error: unknown): this {
    return this.respond(url, async () => {
      throw error;
    });
  }

  respondWithText(url: string, text: string, status: number): this {
    return this.respond(url, async () => new Response(text, { status, headers: { 'Content-Type': 'text/html' } }));
  }

  callsTo(url: string): RecordedGraphCall[] {
    return this.calls.filter((call) => call.url === url);
  }

  assertNoUnexpectedCalls(): void {
    if (this.unexpected.length > 0) {
      throw new Error(`Se hicieron llamadas fetch no declaradas: ${this.unexpected.join(', ')}`);
    }
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Cómo rechaza `AbortSignal.timeout` a fetch: sin esperar los 10 s reales. */
export function timeoutAbortError(): DOMException {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
}
