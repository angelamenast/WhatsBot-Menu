import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { messagesPayload, textPayload } from '../support/meta-payloads';
import { VERIFY_TOKEN, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

// Ruta de control SIN @SkipThrottle: demuestra que el ThrottlerGuard real está activo en esta app.
@Controller('control')
class ThrottledControlController {
  @Get()
  ping(): string {
    return 'ok';
  }
}

const LIMIT = 3;

/**
 * Documenta el comportamiento ACTUAL con el ThrottlerGuard REAL como guard global (como AppModule,
 * que lo registra con 120 peticiones/60 s por IP: app.module.ts:24-29,43). El límite se baja a 3
 * aquí para no enviar cientos de peticiones; no se importa AppModule (leería el .env).
 * El controller del webhook lleva @SkipThrottle() (meta-webhook.controller.ts:25).
 */
describe('Throttling sobre el webhook (ThrottlerGuard real)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp({
      throttler: { ttl: 60_000, limit: LIMIT },
      extraControllers: [ThrottledControlController],
    });
    await testApp.seedBusiness();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const control = () => request(testApp.server).get('/api/control');
  const statusesOf = async (count: number, send: (index: number) => Promise<{ status: number }>) => {
    const statuses: number[] = [];

    for (let index = 0; index < count; index += 1) {
      statuses.push((await send(index)).status);
    }

    return statuses;
  };

  it('control: una ruta sin @SkipThrottle responde 429 al superar el límite (el guard está activo)', async () => {
    expect(await statusesOf(LIMIT + 2, () => control())).toEqual([200, 200, 200, 429, 429]);
  });

  it('POST del webhook: muy por encima del límite, todas las peticiones responden 200 y se procesan (nunca 429)', async () => {
    const total = LIMIT * 4;

    const statuses = await statusesOf(total, (index) => testApp.postWebhook(textPayload({ id: `wamid.IN.${index}` })));
    await testApp.settle();

    expect(statuses).toEqual(Array<number>(total).fill(200));
    expect(testApp.agent.calls).toHaveLength(total);
  });

  it('GET de verificación: tampoco se limita', async () => {
    const total = LIMIT * 4;

    const statuses = await statusesOf(total, () =>
      testApp.getVerification({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' }),
    );

    expect(statuses).toEqual(Array<number>(total).fill(200));
  });

  it('el tráfico del webhook no consume el presupuesto por IP de las demás rutas', async () => {
    await statusesOf(LIMIT * 4, (index) => testApp.postWebhook(messagesPayload([{ id: `wamid.IN.${index}` }])));
    await testApp.settle();

    expect(await statusesOf(LIMIT + 1, () => control())).toEqual([200, 200, 200, 429]);
  });

  // Consecuencia de @SkipThrottle: la única barrera contra peticiones forjadas es la firma HMAC.
  it('peticiones con firma inválida repetidas: siempre 401, nunca 429 (no hay límite de intentos)', async () => {
    const statuses = await statusesOf(LIMIT * 4, () => testApp.postWebhook(textPayload(), 'sha256=00'));

    expect(statuses).toEqual(Array<number>(LIMIT * 4).fill(401));
    expect(testApp.agent.calls).toEqual([]);
  });
});
