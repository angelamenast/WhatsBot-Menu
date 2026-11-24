import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { INestApplication, Logger, Type, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Test as SupertestRequest } from 'supertest';
import type { App } from 'supertest/types';
import { SupabaseModule } from '../../../../shared/supabase/supabase.module';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { VencimientosJob } from '../../../subscriptions/infrastructure/jobs/vencimientos.job';
import { AGENT_DISPATCH_PORT } from '../../application/ports/out/agent-dispatch.port';
import { MESSAGING_PORT } from '../../application/ports/out/messaging.port';
import { PLAN_STATUS_PORT } from '../../application/ports/out/plan-status.port';
import { HandleIncomingMessageUseCase } from '../../application/use-cases/handle-incoming-message.use-case';
import { HandleStatusCallbackUseCase } from '../../application/use-cases/handle-status-callback.use-case';
import { WhatsappConnection, WhatsappConnectionStatus } from '../../domain/entities/whatsapp-connection.entity';
import { CONVERSATION_REPOSITORY } from '../../domain/repositories/conversation.repository';
import { MESSAGE_REPOSITORY } from '../../domain/repositories/message.repository';
import { PROCESSED_MESSAGE_REPOSITORY } from '../../domain/repositories/processed-message.repository';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../domain/repositories/whatsapp-connection.repository';
import { MetaGraphClient } from '../../infrastructure/adapters/meta-graph.client';
import { MetaMessagingAdapter } from '../../infrastructure/adapters/meta-messaging.adapter';
import { nextMacrotask } from './async-helpers';
import { FakePlanStatus, RecordingAgentDispatch, RecordingMessaging } from './fake-ports';
import { GRAPH_ACCESS_TOKEN, GRAPH_API_VERSION, GraphFetchStub } from './graph-fetch-stub';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemoryProcessedMessageRepository,
  InMemoryWhatsappConnectionRepository,
} from './in-memory-repositories';
import { DEFAULT_PHONE_NUMBER_ID, signBody } from './meta-payloads';

// La primera prueba de cada archivo compila y carga todo el grafo de módulos (ts-jest en frío) y, con
// varios workers en paralelo, puede superar los 5 s por defecto sin que haya ningún fallo real.
// Se ejecuta al importar este archivo, así que aplica a cada spec que use el bootstrap.
jest.setTimeout(30_000);

export const WEBHOOK_PATH = '/api/whatsapp/webhook';
export const APP_SECRET = 'app-secret-de-prueba';
export const VERIFY_TOKEN = 'verify-token-de-prueba';

export const BUSINESS_A = '00000000-0000-4000-8000-00000000000a';
export const BUSINESS_B = '00000000-0000-4000-8000-00000000000b';
export const PHONE_NUMBER_ID_B = '200000000000002';

export interface WhatsappTestAppOptions {
  /** `recording` (por defecto): puerto fake. `meta`: adaptador real de Meta sobre el stub de fetch. */
  messaging?: 'recording' | 'meta';
  /** Registra el ThrottlerGuard REAL como guard global (como AppModule). Por defecto NO hay throttler. */
  throttler?: { ttl: number; limit: number };
  /** Controladores extra (p. ej. una ruta de control para las pruebas de throttling). */
  extraControllers?: Type<unknown>[];
  /** Sustituye/añade variables de configuración; `undefined` borra la variable. */
  env?: Record<string, string | undefined>;
}

export interface CapturedLogs {
  warn: string[];
  error: string[];
}

/**
 * Levanta el módulo REAL de WhatsApp (controller, guard, parser, casos de uso y adaptadores) con
 * persistencia in-memory y puertos externos fake. Replica `main.ts`: `rawBody: true`, prefijo `api`
 * y `ValidationPipe({ whitelist: true })`. No replica `enableCors` (irrelevante para el webhook)
 * ni `trust proxy` (main.ts no lo configura).
 *
 * Aislamiento:
 *  - No importa AppModule: el único `ConfigModule.forRoot` que lee `.env` vive allí. Aquí se usa
 *    `ignoreEnvFile` y ADEMÁS `ConfigService` se sustituye por un stub: nada lee `process.env`.
 *  - `SupabaseService` lanza si alguien lo usa; `fetch` global lanza ante cualquier URL no declarada.
 *  - El cron de vencimientos (SubscriptionsModule) se anula para que no cree temporizadores.
 */
export async function createWhatsappTestApp(options: WhatsappTestAppOptions = {}) {
  const env: Record<string, string | undefined> = {
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
    ...options.env,
  };

  const connections = new InMemoryWhatsappConnectionRepository();
  const conversations = new InMemoryConversationRepository();
  const messages = new InMemoryMessageRepository();
  const processed = new InMemoryProcessedMessageRepository(messages);
  const agent = new RecordingAgentDispatch();
  const messaging = new RecordingMessaging();
  const plan = new FakePlanStatus();
  const graph = new GraphFetchStub();
  graph.install();

  const logs: CapturedLogs = { warn: [], error: [] };
  const spies = [
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
    jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined),
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((...args: unknown[]) => {
      logs.warn.push(args.map(String).join(' '));
    }),
    jest.spyOn(Logger.prototype, 'error').mockImplementation((...args: unknown[]) => {
      logs.error.push(args.map(String).join(' '));
    }),
  ];

  const configStub = {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
    getOrThrow: (key: string) => {
      const value = env[key];

      if (value === undefined) {
        throw new Error(`Configuración "${key}" no definida en la prueba`);
      }

      return value;
    },
  };

  // Carga dinámica: @nestjs/throttler es CommonJS y, con Jest en modo ESM, falla si se evalúa antes
  // de que @nestjs/common esté cargado (el controller importa SkipThrottle). La ruta va en variable
  // porque con module nodenext tsc exige extensión en import() literales relativos.
  const modulePath = '../../whatsapp.module';
  const { WhatsappModule } = (await import(modulePath)) as { WhatsappModule: Type<unknown> };
  const throttlerModule = options.throttler ? await import('@nestjs/throttler') : null;

  const builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
      EventEmitterModule.forRoot(),
      SupabaseModule,
      ...(throttlerModule && options.throttler
        ? [throttlerModule.ThrottlerModule.forRoot([{ ttl: options.throttler.ttl, limit: options.throttler.limit }])]
        : []),
      WhatsappModule,
    ],
    controllers: options.extraControllers ?? [],
    providers:
      throttlerModule && options.throttler
        ? [{ provide: APP_GUARD, useClass: throttlerModule.ThrottlerGuard }]
        : [],
  })
    .overrideProvider(ConfigService)
    .useValue(configStub)
    .overrideProvider(SupabaseService)
    .useValue({
      getClient: () => {
        throw new Error('Supabase real no está disponible en las pruebas de integración');
      },
    })
    .overrideProvider(VencimientosJob)
    .useValue({})
    .overrideProvider(WHATSAPP_CONNECTION_REPOSITORY)
    .useValue(connections)
    .overrideProvider(CONVERSATION_REPOSITORY)
    .useValue(conversations)
    .overrideProvider(MESSAGE_REPOSITORY)
    .useValue(messages)
    .overrideProvider(PROCESSED_MESSAGE_REPOSITORY)
    .useValue(processed)
    .overrideProvider(PLAN_STATUS_PORT)
    .useValue(plan)
    .overrideProvider(AGENT_DISPATCH_PORT)
    .useValue(agent)
    .overrideProvider(MESSAGING_PORT)
    .useValue(
      options.messaging === 'meta'
        ? new MetaMessagingAdapter(new MetaGraphClient({ apiVersion: GRAPH_API_VERSION, accessToken: GRAPH_ACCESS_TOKEN }))
        : messaging,
    );

  const moduleRef = await builder.compile();
  const app: INestApplication<App> = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  // El controller procesa en segundo plano y no expone la promesa: se observan los casos de uso reales.
  const incomingSpy = jest.spyOn(app.get(HandleIncomingMessageUseCase), 'execute');
  const statusSpy = jest.spyOn(app.get(HandleStatusCallbackUseCase), 'execute');

  const pendingExecutions = () =>
    [...incomingSpy.mock.results, ...statusSpy.mock.results].map((result) => result.value as Promise<unknown>);

  const server = app.getHttpServer();

  const postRaw = (rawBody: string, signature?: string | null, contentType = 'application/json'): SupertestRequest => {
    const req = request(server).post(WEBHOOK_PATH).set('Content-Type', contentType);

    if (signature !== null) {
      req.set('X-Hub-Signature-256', signature ?? signBody(rawBody, env.WHATSAPP_APP_SECRET ?? APP_SECRET));
    }

    return req.send(rawBody);
  };

  return {
    app,
    server,
    env,
    logs,
    connections,
    conversations,
    messages,
    processed,
    agent,
    messaging,
    plan,
    graph,

    /** Crea una conexión CONNECTED para el negocio; `phoneNumberId` es por el que llegan los mensajes. */
    async seedBusiness(businessId = BUSINESS_A, phoneNumberId = DEFAULT_PHONE_NUMBER_ID) {
      const now = new Date();
      await connections.save(
        WhatsappConnection.create({
          id: randomUUID(),
          businessId,
          phoneNumberId,
          wabaId: `waba-${phoneNumberId}`,
          phoneNumber: `15${phoneNumberId.slice(-9)}`,
          status: WhatsappConnectionStatus.CONNECTED,
          createdAt: now,
          updatedAt: now,
        }),
      );
    },

    /** POST firmado: la firma se calcula sobre el MISMO texto crudo que se envía. */
    postWebhook(payload: unknown, signature?: string | null): SupertestRequest {
      return postRaw(JSON.stringify(payload), signature);
    },
    postRaw,
    getVerification(query: Record<string, string | string[]>): SupertestRequest {
      return request(server).get(WEBHOOK_PATH).query(query);
    },

    /**
     * Espera a que termine el procesamiento en segundo plano de todo lo recibido hasta ahora, sin
     * temporizadores: repite hasta que ya no aparecen ejecuciones nuevas de los casos de uso.
     * No usar mientras haya un despacho retenido (`agent.holdNext`): quedaría esperando.
     */
    async settle(): Promise<void> {
      let previous = -1;

      for (let total = pendingExecutions().length; total !== previous; total = pendingExecutions().length) {
        previous = total;
        await Promise.allSettled(pendingExecutions());
        await nextMacrotask();
      }
    },

    /** Congela SOLO `Date` (el resto de temporizadores sigue real, necesario para supertest). */
    freezeClock(now: Date): void {
      jest.useFakeTimers({
        now,
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
    },
    advanceClock(ms: number): void {
      jest.setSystemTime(Date.now() + ms);
    },

    async close(): Promise<void> {
      jest.useRealTimers();
      await app.close();
      incomingSpy.mockRestore();
      statusSpy.mockRestore();
      graph.restore();
      spies.forEach((spy) => spy.mockRestore());
      graph.assertNoUnexpectedCalls();
    },
  };
}

export type WhatsappTestApp = Awaited<ReturnType<typeof createWhatsappTestApp>>;
