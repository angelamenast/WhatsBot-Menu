import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { AgentRegionalStyle, AgentTone } from '../../../domain/enums/agent-style';
import { LlmGenerationError } from '../../../domain/errors/agent.errors';
import type { CatalogItem } from '../../../domain/repositories/catalog.repository';
import type { GenerateReplyParams } from '../../../application/ports/out/llm.port';
import { PROPOSE_ORDER_PARAMETERS } from '../../../application/prompt/propose-order.schema';
import { GeminiLlmAdapter } from './gemini-llm.adapter';
import type { GeminiRequest, GeminiResponse, GeminiResponsePart } from './gemini-client';
import type { GeminiConfig } from './gemini-config';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_MESSAGE = 'MENSAJE-PRIVADO-DEL-CLIENTE quiero algo';
const NOW = new Date('2026-11-03T15:30:00.000Z');

const config: GeminiConfig = {
  apiKey: 'AQ.clave-de-prueba-no-real',
  model: 'gemini-de-prueba',
  timeoutMs: 5000,
  maxOutputTokens: 1024,
  thinkingLevel: 'low',
};

const item = (id: string, name: string, available = true): CatalogItem => ({
  id,
  name,
  description: null,
  price: 18000,
  available,
  categoryName: null,
});

const params = (overrides: Partial<GenerateReplyParams> = {}): GenerateReplyParams => ({
  businessName: 'Mi Restaurante',
  businessHours: null,
  isFirstMessage: false,
  personality: null,
  tone: AgentTone.AMABLE,
  regionalStyle: AgentRegionalStyle.NEUTRO,
  catalog: [item(ID_1, 'Hamburguesa secreta'), item(ID_2, 'Limonada secreta')],
  history: [],
  customerMessage: CUSTOMER_MESSAGE,
  ...overrides,
});

const response = (
  parts: GeminiResponsePart[],
  extras: Partial<GeminiResponse> & { finishReason?: string } = {},
): GeminiResponse => {
  const { finishReason = 'STOP', ...rest } = extras;
  return {
    candidates: [{ finishReason, content: { parts } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 0 },
    ...rest,
  };
};

describe('GeminiLlmAdapter', () => {
  let generateContent: jest.Mock<(request: GeminiRequest) => Promise<GeminiResponse>>;
  let adapter: GeminiLlmAdapter;
  let sleep: jest.Mock<(ms: number) => Promise<void>>;
  let elapsedMs: number;
  let loggerSpies: Array<jest.SpiedFunction<any>>;

  const requestSent = (): GeminiRequest => generateContent.mock.calls[0][0];
  const allLogged = () =>
    loggerSpies
      .flatMap((spy) => spy.mock.calls)
      .map((args: unknown[]) => args.map(String).join(' '))
      .join('\n');

  beforeEach(() => {
    generateContent = jest.fn<(request: GeminiRequest) => Promise<GeminiResponse>>();
    elapsedMs = 0;
    // El reloj y la espera son falsos: los tests de reintento no esperan 1 s de verdad.
    sleep = jest.fn(async (ms: number) => {
      elapsedMs += ms;
    });
    adapter = new GeminiLlmAdapter({ models: { generateContent } }, config, () => NOW, {
      sleep,
      clock: () => elapsedMs,
    });
    loggerSpies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('respuesta feliz', () => {
    it('devuelve el texto recortado, sin pedido propuesto', async () => {
      generateContent.mockResolvedValue(response([{ text: '  Tenemos hamburguesas.  ' }]));

      const result = await adapter.generateReply(params());

      expect(result.text).toBe('Tenemos hamburguesas.');
      expect(result.proposedOrder).toBeNull();
    });

    it('informa el modelo que respondió (el principal, sin reintentos ni esperas)', async () => {
      generateContent.mockResolvedValue(response([{ text: 'ok' }]));

      const result = await adapter.generateReply(params());

      expect(result.model).toBe('gemini-de-prueba');
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('une varias partes de texto y descarta las partes de razonamiento', async () => {
      generateContent.mockResolvedValue(
        response([{ text: 'RAZONAMIENTO INTERNO', thought: true }, { text: 'Hola, ' }, { text: 'bienvenido.' }]),
      );

      const result = await adapter.generateReply(params());

      expect(result.text).toBe('Hola, bienvenido.');
    });
  });

  describe('petición al proveedor', () => {
    beforeEach(() => {
      generateContent.mockResolvedValue(response([{ text: 'ok' }]));
    });

    it('usa el modelo, el tope de tokens y el nivel de razonamiento configurados', async () => {
      await adapter.generateReply(params());

      expect(requestSent().model).toBe('gemini-de-prueba');
      expect(requestSent().config.maxOutputTokens).toBe(1024);
      expect(requestSent().config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    });

    it('lleva un AbortSignal para el timeout', async () => {
      await adapter.generateReply(params());

      expect(requestSent().config.abortSignal).toBeInstanceOf(AbortSignal);
      expect(requestSent().config.abortSignal.aborted).toBe(false);
    });

    it('declara la herramienta propose_order con el esquema neutro', async () => {
      await adapter.generateReply(params());

      const declarations = requestSent().config.tools[0].functionDeclarations;
      expect(declarations).toHaveLength(1);
      expect(declarations[0].name).toBe('propose_order');
      expect(declarations[0].parametersJsonSchema).toBe(PROPOSE_ORDER_PARAMETERS);
    });

    it('el system prompt trae el catálogo con referencias P1…Pn, sin ids reales ni el mensaje del cliente', async () => {
      await adapter.generateReply(params({ history: [{ sender: 'CUSTOMER', content: 'HISTORIAL-PRIVADO', createdAt: new Date() }] }));

      const system = requestSent().config.systemInstruction;
      expect(system).toContain('P1 | Hamburguesa secreta');
      expect(system).toContain('P2 | Limonada secreta');
      expect(system).not.toContain(ID_1);
      expect(system).not.toContain(ID_2);
      expect(system).not.toContain('MENSAJE-PRIVADO-DEL-CLIENTE');
      expect(system).not.toContain('HISTORIAL-PRIVADO');
    });

    it('el reloj inyectado fija la fecha del system prompt (America/Bogota)', async () => {
      await adapter.generateReply(params());

      const system = requestSent().config.systemInstruction;
      expect(system).toContain('America/Bogota');
      expect(system).toContain('3 de noviembre de 2026');
    });

    it('el mensaje del cliente va como último turno user, con el historial en roles user/model', async () => {
      await adapter.generateReply(
        params({
          history: [
            { sender: 'CUSTOMER', content: 'hola', createdAt: new Date() },
            { sender: 'AGENT', content: 'buenas', createdAt: new Date() },
          ],
        }),
      );

      expect(requestSent().contents).toEqual([
        { role: 'user', parts: [{ text: 'hola' }] },
        { role: 'model', parts: [{ text: 'buenas' }] },
        { role: 'user', parts: [{ text: CUSTOMER_MESSAGE }] },
      ]);
    });

    it('descarta los mensajes iniciales del agente: contents siempre empieza por el usuario', async () => {
      await adapter.generateReply(
        params({
          history: [
            { sender: 'AGENT', content: 'bienvenida', createdAt: new Date() },
            { sender: 'AGENT', content: 'segunda', createdAt: new Date() },
            { sender: 'CUSTOMER', content: 'hola', createdAt: new Date() },
          ],
        }),
      );

      expect(requestSent().contents.map((content) => content.role)).toEqual(['user', 'user']);
      expect(requestSent().contents[0].parts[0].text).toBe('hola');
    });
  });

  describe('uso de tokens', () => {
    it('entrada = prompt + herramientas; salida = candidatos + razonamiento (la facturación)', async () => {
      generateContent.mockResolvedValue(
        response([{ text: 'ok' }], {
          usageMetadata: {
            promptTokenCount: 100,
            toolUsePromptTokenCount: 20,
            candidatesTokenCount: 30,
            thoughtsTokenCount: 70,
            totalTokenCount: 220,
          },
        }),
      );

      const result = await adapter.generateReply(params());

      expect(result.tokensInput).toBe(120);
      expect(result.tokensOutput).toBe(100);
    });

    it('los campos ausentes cuentan como 0', async () => {
      generateContent.mockResolvedValue(
        response([{ text: 'ok' }], { usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 } }),
      );

      const result = await adapter.generateReply(params());

      expect(result.tokensInput).toBe(50);
      expect(result.tokensOutput).toBe(10);
    });

    it('sin usageMetadata estima por caracteres y avisa sin contenido', async () => {
      const reply = response([{ text: 'x'.repeat(40) }]);
      delete reply.usageMetadata;
      generateContent.mockResolvedValue(reply);

      const result = await adapter.generateReply(params());

      expect(result.tokensOutput).toBe(10);
      expect(result.tokensInput).toBeGreaterThan(0);
      const logged = allLogged();
      expect(logged).toContain('usageMetadata');
      expect(logged).not.toContain('MENSAJE-PRIVADO-DEL-CLIENTE');
      expect(logged).not.toContain('secreta');
    });
  });

  describe('pedido propuesto (function calling)', () => {
    it('convierte las referencias P1…Pn en ids reales; el texto puede venir vacío', async () => {
      generateContent.mockResolvedValue(
        response([{ functionCall: { name: 'propose_order', args: { items: [{ ref: 'P2', quantity: 1 }, { ref: 'P1', quantity: 3 }] } } }]),
      );

      const result = await adapter.generateReply(params());

      expect(result.proposedOrder).toEqual({
        items: [
          { productId: ID_2, quantity: 1 },
          { productId: ID_1, quantity: 3 },
        ],
      });
      expect(result.text).toBe('');
    });

    it('las referencias siguen al orden del catálogo recibido', async () => {
      generateContent.mockResolvedValue(
        response([{ functionCall: { name: 'propose_order', args: { items: [{ ref: 'P1', quantity: 1 }] } } }]),
      );

      const reversed = params().catalog.slice().reverse();
      const result = await adapter.generateReply(params({ catalog: reversed }));

      expect(result.proposedOrder?.items[0].productId).toBe(ID_2);
    });

    it('referencias alucinadas se ignoran; si queda alguna válida, se propone solo esa', async () => {
      generateContent.mockResolvedValue(
        response([{ functionCall: { name: 'propose_order', args: { items: [{ ref: 'P9', quantity: 1 }, { ref: 'P2', quantity: 2 }] } } }]),
      );

      const result = await adapter.generateReply(params());

      expect(result.proposedOrder).toEqual({ items: [{ productId: ID_2, quantity: 2 }] });
    });

    it('llamada inválida pero con texto: devuelve el texto y ningún pedido', async () => {
      generateContent.mockResolvedValue(
        response([{ text: '¿Me confirmas las cantidades?' }, { functionCall: { name: 'propose_order', args: { items: [] } } }]),
      );

      const result = await adapter.generateReply(params());

      expect(result.proposedOrder).toBeNull();
      expect(result.text).toBe('¿Me confirmas las cantidades?');
    });

    it('llamada inválida y sin texto: LlmGenerationError', async () => {
      generateContent.mockResolvedValue(
        response([{ functionCall: { name: 'propose_order', args: { items: [{ ref: 'P9', quantity: 1 }] } } }]),
      );

      await expect(adapter.generateReply(params())).rejects.toThrow(LlmGenerationError);
    });

    it('una herramienta con otro nombre se ignora', async () => {
      generateContent.mockResolvedValue(
        response([{ text: 'hola' }, { functionCall: { name: 'otra_herramienta', args: { items: [{ ref: 'P1', quantity: 1 }] } } }]),
      );

      const result = await adapter.generateReply(params());

      expect(result.proposedOrder).toBeNull();
    });

    it('el modelo no puede aportar precios, totales ni ids: solo salen ids del catálogo y cantidades', async () => {
      generateContent.mockResolvedValue(
        response([
          { functionCall: { name: 'propose_order', args: { total: 1, items: [{ ref: 'P1', quantity: 1, price: 1, productId: 'inventado' }] } } },
        ]),
      );

      const result = await adapter.generateReply(params());

      expect(JSON.stringify(result.proposedOrder)).not.toMatch(/price|total|inventado/);
    });
  });

  describe('errores', () => {
    it('error del proveedor con código HTTP: LlmGenerationError con el código y SIN el mensaje original', async () => {
      generateContent.mockRejectedValue(
        Object.assign(new Error('API key not valid AQ.clave-de-prueba-no-real'), { status: 429, name: 'ApiError' }),
      );

      const error = await adapter.generateReply(params()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect((error as Error).message).toContain('HTTP 429');
      expect((error as Error).message).not.toContain('AQ.');
      expect((error as Error).message).not.toContain('API key');
    });

    it('error sin código: motivo genérico, sin el mensaje original', async () => {
      generateContent.mockRejectedValue(new Error('detalle interno con datos del cliente'));

      const error = await adapter.generateReply(params()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect((error as Error).message).toContain('error del proveedor');
      expect((error as Error).message).not.toContain('detalle interno');
    });

    it('timeout: el AbortSignal vence y se reporta como tiempo de espera agotado', async () => {
      const shortTimeout = new GeminiLlmAdapter({ models: { generateContent } }, { ...config, timeoutMs: 20 }, () => NOW);
      generateContent.mockImplementation(
        (request) =>
          new Promise((_resolve, reject) => {
            request.config.abortSignal.addEventListener('abort', () =>
              reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
            );
          }),
      );

      const error = await shortTimeout.generateReply(params()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect((error as Error).message).toContain('tiempo de espera agotado (20 ms)');
    });

    it('un AbortError aunque la señal no figure vencida también cuenta como timeout', async () => {
      generateContent.mockRejectedValue(Object.assign(new Error('x'), { name: 'TimeoutError' }));

      const error = await adapter.generateReply(params()).catch((e: unknown) => e);

      expect((error as Error).message).toContain('tiempo de espera agotado');
    });

    it('solicitud bloqueada (promptFeedback): error con el código de bloqueo', async () => {
      generateContent.mockResolvedValue({ promptFeedback: { blockReason: 'SAFETY' } });

      const error = await adapter.generateReply(params()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect((error as Error).message).toContain('SAFETY');
    });

    it('sin candidatos: error', async () => {
      generateContent.mockResolvedValue({ candidates: [] });

      await expect(adapter.generateReply(params())).rejects.toThrow(LlmGenerationError);
    });

    it.each(['SAFETY', 'MAX_TOKENS', 'MALFORMED_FUNCTION_CALL', 'RECITATION', 'OTHER'])(
      'finishReason %s: error, aunque haya texto parcial',
      async (finishReason) => {
        generateContent.mockResolvedValue(response([{ text: 'respuesta cortada a la mitad' }], { finishReason }));

        const error = await adapter.generateReply(params()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LlmGenerationError);
        expect((error as Error).message).toContain(finishReason);
      },
    );

    it('respuesta vacía (solo razonamiento): error', async () => {
      generateContent.mockResolvedValue(response([{ text: 'pensando...', thought: true }]));

      await expect(adapter.generateReply(params())).rejects.toThrow(LlmGenerationError);
    });
  });

  describe('resiliencia ante 503 y 429', () => {
    const withFallback = () =>
      new GeminiLlmAdapter({ models: { generateContent } }, { ...config, fallbackModel: 'modelo-de-respaldo' }, () => NOW, {
        sleep,
        clock: () => elapsedMs,
      });

    const transient = (status: number) =>
      Object.assign(new Error('mensaje del proveedor con datos internos'), { status, name: 'ApiError' });

    const modelsCalled = () => generateContent.mock.calls.map(([request]) => request.model);

    it('503 y luego éxito: reintenta el principal una vez tras 1 s y no usa el respaldo', async () => {
      generateContent.mockRejectedValueOnce(transient(503)).mockResolvedValueOnce(response([{ text: 'ok' }]));

      const result = await withFallback().generateReply(params());

      expect(modelsCalled()).toEqual(['gemini-de-prueba', 'gemini-de-prueba']);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(1000);
      expect(result.model).toBe('gemini-de-prueba');
    });

    it('503 dos veces y respaldo exitoso: responde el respaldo y lo informa como modelo real', async () => {
      generateContent
        .mockRejectedValueOnce(transient(503))
        .mockRejectedValueOnce(transient(503))
        .mockResolvedValueOnce(response([{ text: 'respuesta del respaldo' }]));

      const result = await withFallback().generateReply(params());

      expect(modelsCalled()).toEqual(['gemini-de-prueba', 'gemini-de-prueba', 'modelo-de-respaldo']);
      expect(result.text).toBe('respuesta del respaldo');
      expect(result.model).toBe('modelo-de-respaldo');
    });

    it('429 dos veces y respaldo exitoso: también pasa al respaldo', async () => {
      generateContent
        .mockRejectedValueOnce(transient(429))
        .mockRejectedValueOnce(transient(429))
        .mockResolvedValueOnce(response([{ text: 'ok' }]));

      const result = await withFallback().generateReply(params());

      expect(result.model).toBe('modelo-de-respaldo');
      expect(generateContent).toHaveBeenCalledTimes(3);
    });

    it('503 en el principal y 429 en el reintento: sigue al respaldo (ambos son transitorios)', async () => {
      generateContent
        .mockRejectedValueOnce(transient(503))
        .mockRejectedValueOnce(transient(429))
        .mockResolvedValueOnce(response([{ text: 'ok' }]));

      const result = await withFallback().generateReply(params());

      expect(result.model).toBe('modelo-de-respaldo');
    });

    it('principal, reintento y respaldo fallan: LlmGenerationError con los códigos y sin el mensaje del proveedor', async () => {
      generateContent.mockRejectedValue(transient(503));

      const error = await withFallback()
        .generateReply(params())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect(generateContent).toHaveBeenCalledTimes(3);
      expect((error as Error).message).toContain('principal: HTTP 503');
      expect((error as Error).message).toContain('reintento: HTTP 503');
      expect((error as Error).message).toContain('respaldo: HTTP 503');
      expect((error as Error).message).not.toContain('datos internos');
    });

    it('sin modelo de respaldo configurado: tras el reintento falla con LlmGenerationError', async () => {
      generateContent.mockRejectedValue(transient(503));

      const error = await adapter.generateReply(params()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(modelsCalled()).toEqual(['gemini-de-prueba', 'gemini-de-prueba']);
    });

    it.each([400, 401, 403, 404])('HTTP %s es configuración inválida: un solo intento, sin espera ni respaldo', async (status) => {
      generateContent.mockRejectedValue(transient(status));

      const error = await withFallback()
        .generateReply(params())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmGenerationError);
      expect((error as Error).message).toContain('HTTP ' + status);
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('si el reintento devuelve un error de configuración (401), ya no sigue al respaldo', async () => {
      generateContent.mockRejectedValueOnce(transient(503)).mockRejectedValueOnce(transient(401));

      await expect(withFallback().generateReply(params())).rejects.toThrow(LlmGenerationError);

      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it('un error sin código (red, etc.) no se reintenta', async () => {
      generateContent.mockRejectedValue(new Error('socket hang up'));

      await expect(withFallback().generateReply(params())).rejects.toThrow(LlmGenerationError);

      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('un 500 tampoco se reintenta: solo 503 y 429 son transitorios', async () => {
      generateContent.mockRejectedValue(transient(500));

      await expect(withFallback().generateReply(params())).rejects.toThrow(LlmGenerationError);

      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('cada intento recibe lo que reste del presupuesto total y usa su propio modelo', async () => {
      generateContent
        .mockImplementationOnce(async () => {
          elapsedMs += 700; // el primer intento tardó 700 ms antes de fallar
          throw transient(503);
        })
        .mockRejectedValueOnce(transient(503))
        .mockResolvedValueOnce(response([{ text: 'ok' }]));

      await withFallback().generateReply(params());

      // Presupuesto 5000 ms: el respaldo llega después de 700 ms + 1000 ms de espera, y su señal es
      // una señal real de AbortSignal (no vencida todavía).
      const signals = generateContent.mock.calls.map(([request]) => request.config.abortSignal);
      expect(signals).toHaveLength(3);
      expect(signals.every((signal) => signal instanceof AbortSignal && !signal.aborted)).toBe(true);
      expect(elapsedMs).toBe(1700);
    });

    it('sin presupuesto para el reintento (la espera lo agota): no intenta de nuevo y falla', async () => {
      const tight = new GeminiLlmAdapter(
        { models: { generateContent } },
        { ...config, timeoutMs: 1200, fallbackModel: 'modelo-de-respaldo' },
        () => NOW,
        { sleep, clock: () => elapsedMs },
      );
      generateContent.mockImplementationOnce(async () => {
        elapsedMs += 400;
        throw transient(503);
      });

      const error = await tight.generateReply(params()).catch((e: unknown) => e);

      // 400 ms del intento + 1000 ms de espera superan los 1200 ms: no hay tiempo para otro intento.
      expect(error).toBeInstanceOf(LlmGenerationError);
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect((error as Error).message).toContain('sin tiempo restante');
    });

    it('registra modelo, código y latencia de cada intento, sin contenido de mensajes ni catálogo', async () => {
      generateContent
        .mockImplementationOnce(async () => {
          elapsedMs += 250;
          throw transient(503);
        })
        .mockRejectedValueOnce(transient(429))
        .mockResolvedValueOnce(response([{ text: 'ok' }]));

      await withFallback().generateReply(params());

      const logged = allLogged();
      expect(logged).toContain('modelo=gemini-de-prueba, código=HTTP 503, latencia=250 ms');
      expect(logged).toContain('código=HTTP 429');
      expect(logged).toContain('modelo=modelo-de-respaldo');
      expect(logged).toContain('respaldo');
      expect(logged).not.toContain('MENSAJE-PRIVADO-DEL-CLIENTE');
      expect(logged).not.toContain('secreta');
      expect(logged).not.toContain('datos internos');
      expect(logged).not.toContain('AQ.');
    });
  });

  describe('privacidad', () => {
    it('no loguea mensajes, historial, catálogo ni la clave en ningún camino', async () => {
      generateContent.mockResolvedValueOnce(response([{ text: 'ok' }]));
      generateContent.mockRejectedValueOnce(new Error('falló ' + config.apiKey));
      generateContent.mockResolvedValueOnce({ candidates: [] });

      await adapter.generateReply(params());
      await adapter.generateReply(params()).catch(() => undefined);
      await adapter.generateReply(params()).catch(() => undefined);

      const logged = allLogged();
      expect(logged).not.toContain('MENSAJE-PRIVADO-DEL-CLIENTE');
      expect(logged).not.toContain('secreta');
      expect(logged).not.toContain('AQ.');
    });
  });
});
