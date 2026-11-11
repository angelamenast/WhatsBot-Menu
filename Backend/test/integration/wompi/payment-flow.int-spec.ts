import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestContext, type TestUser } from '../support/test-context';
import { createTestApp, testAppConfig } from '../support/test-app';
import { buildWompiEvent, type WompiStatus } from '../support/wompi-events';
import { describeWithWompi } from '../support/wompi-env';

const { env, describe: describeWompi } = describeWithWompi();

const DIA_MS = 24 * 60 * 60 * 1000;
const PRECIO_PLAN = 15000; // COP

interface TransaccionRow {
  id: string;
  suscripcion_id: string;
  estado: string;
}

interface SuscripcionRow {
  id: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
}

describeWompi('Wompi sandbox: flujo API → link de pago → webhook firmado → Supabase', () => {
  const wompi = env;
  const ctx = new TestContext();
  let app: INestApplication;
  let user: TestUser;
  let token: string;
  let negocioId: string;
  let planId: string;

  // Link aprobado en IT-WOMPI-05 (se reusa en IT-WOMPI-09).
  let linkAprobado: string;
  let suscripcionAprobada: string;

  const http = () => request(app.getHttpServer());

  const generarLink = async (): Promise<{ linkId: string; suscripcionId: string }> => {
    const res = await http()
      .post('/api/payments/generate-link')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId });
    expect([200, 201]).toContain(res.status);
    expect(res.body.paymentUrl).toMatch(/^https:\/\/checkout\.wompi\.co\/l\/[^/]+$/);
    return { linkId: res.body.paymentUrl.split('/l/')[1], suscripcionId: res.body.suscripcionId };
  };

  const enviarWebhook = (linkId: string, status: WompiStatus, secret = wompi.eventsSecret, evento?: object) =>
    http()
      .post('/api/payments/webhook')
      .send(evento ?? buildWompiEvent({ paymentLinkId: linkId, status, amountInCents: PRECIO_PLAN * 100, secret }));

  const transaccion = async (linkId: string): Promise<TransaccionRow | null> => {
    const { data, error } = await ctx.client
      .from('transacciones_pago')
      .select('id, suscripcion_id, estado')
      .eq('referencia_wompi', linkId)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const suscripcion = async (id: string): Promise<SuscripcionRow> => {
    const { data, error } = await ctx.client
      .from('suscripciones')
      .select('id, estado, fecha_inicio, fecha_fin')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  };

  const suscripcionesDelNegocio = async (): Promise<SuscripcionRow[]> => {
    const { data, error } = await ctx.client
      .from('suscripciones')
      .select('id, estado, fecha_inicio, fecha_fin')
      .eq('negocio_id', negocioId);
    if (error) throw error;
    return data ?? [];
  };

  beforeAll(async () => {
    app = await createTestApp(testAppConfig(wompi));
    ({ user, negocio: { id: negocioId } } = await ctx.createUserWithNegocio('negocio_wompi'));
    token = await ctx.signIn(user);
    planId = await ctx.createPlan('plan_wompi', { precio: PRECIO_PLAN, duracionMeses: 1 });
  });

  afterAll(async () => {
    await app?.close();
    await ctx.cleanup();
  });

  it('IT-WOMPI-04 POST /api/payments/generate-link crea el link y deja transacción y suscripción pendientes', async () => {
    const { linkId, suscripcionId } = await generarLink();
    linkAprobado = linkId;
    suscripcionAprobada = suscripcionId;

    const tx = await transaccion(linkId);
    expect(tx).toMatchObject({ suscripcion_id: suscripcionId, estado: 'pendiente' });
    expect((await suscripcion(suscripcionId)).estado).toBe('pendiente');
  });

  it('IT-WOMPI-05 webhook APPROVED firmado → aprobado / activa, fecha_fin ≈ fecha_inicio + 1 mes', async () => {
    const antes = Date.now();
    const res = await enviarWebhook(linkAprobado, 'APPROVED');
    const despues = Date.now();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect((await transaccion(linkAprobado))!.estado).toBe('aprobado');

    const s = await suscripcion(suscripcionAprobada);
    expect(s.estado).toBe('activa');
    const inicio = new Date(s.fecha_inicio).getTime();
    const fin = new Date(s.fecha_fin).getTime();
    expect(inicio).toBeGreaterThanOrEqual(antes - 1000);
    expect(inicio).toBeLessThanOrEqual(despues + 1000);
    // duracion_meses = 1: entre 28 y 31 días, a la misma hora.
    expect(fin - inicio).toBeGreaterThanOrEqual(28 * DIA_MS);
    expect(fin - inicio).toBeLessThanOrEqual(31 * DIA_MS);
    expect((fin - inicio) % DIA_MS).toBe(0);
  });

  it('IT-WOMPI-06 webhook DECLINED → transacción rechazado y la suscripción NO queda activa', async () => {
    const { linkId, suscripcionId } = await generarLink();

    const res = await enviarWebhook(linkId, 'DECLINED');

    expect(res.status).toBe(200);
    expect((await transaccion(linkId))!.estado).toBe('rechazado');
    expect((await suscripcion(suscripcionId)).estado).not.toBe('activa');
  });

  it('IT-WOMPI-07 webhook con firma inválida → 401 y nada cambia en la BD', async () => {
    const { linkId, suscripcionId } = await generarLink();
    const txAntes = await transaccion(linkId);
    const susAntes = await suscripcion(suscripcionId);

    const res = await enviarWebhook(linkId, 'APPROVED', 'test_events_secretIncorrecto');

    expect(res.status).toBe(401);
    expect(await transaccion(linkId)).toEqual(txAntes);
    expect(await suscripcion(suscripcionId)).toEqual(susAntes);
    expect(txAntes!.estado).toBe('pendiente');
  });

  it('IT-WOMPI-08 webhook firmado para un payment_link_id que no existe → 404', async () => {
    const res = await enviarWebhook(ctx.name('link_inexistente'), 'APPROVED');
    expect(res.status).toBe(404);
  });

  it('IT-WOMPI-09 idempotencia: el mismo APPROVED dos veces no duplica la suscripción ni alarga fecha_fin', async () => {
    const evento = buildWompiEvent({
      paymentLinkId: linkAprobado,
      status: 'APPROVED',
      amountInCents: PRECIO_PLAN * 100,
      secret: wompi.eventsSecret,
    });
    const antes = await suscripcion(suscripcionAprobada);
    const totalAntes = (await suscripcionesDelNegocio()).length;

    const primero = await enviarWebhook(linkAprobado, 'APPROVED', undefined, evento);
    const segundo = await enviarWebhook(linkAprobado, 'APPROVED', undefined, evento);

    expect(primero.status).toBe(200);
    expect(segundo.status).toBe(200);
    expect(await suscripcion(suscripcionAprobada)).toEqual(antes);
    const despues = await suscripcionesDelNegocio();
    expect(despues).toHaveLength(totalAntes);
    expect(despues.filter((s) => s.estado === 'activa').map((s) => s.id)).toEqual([suscripcionAprobada]);
    expect((await transaccion(linkAprobado))!.estado).toBe('aprobado');
  });
});
