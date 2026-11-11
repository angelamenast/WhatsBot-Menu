import { SupabaseTokenUsageAdapter } from '../../src/modules/agent/infrastructure/adapters/supabase-token-usage.adapter';
import { SupabaseUsageQuotaAdapter } from '../../src/modules/agent/infrastructure/adapters/supabase-usage-quota.adapter';
import { SupabaseSuscripcionRepository } from '../../src/modules/payments/infrastructure/persistence/supabase-suscripcion.repository';
import { TestContext } from './support/test-context';

interface CuotaRow {
  hay_suscripcion: boolean;
  limite_tokens: number | null;
  tokens_usados: number;
}

describe('Persistencia: cuota de IA y RPC consultar_cuota_tokens / registrar_consumo_ia (Supabase real)', () => {
  const ctx = new TestContext();
  const consumo = new SupabaseTokenUsageAdapter(ctx.service);
  const cuota = new SupabaseUsageQuotaAdapter(ctx.service);

  // hasQuota() devuelve true ante cualquier error (prioriza disponibilidad), así que la cuota se
  // verifica también llamando la RPC directamente: así un fallo de la BD no pasa desapercibido.
  const consultarCuota = async (negocioId: string): Promise<CuotaRow> => {
    const { data, error } = await ctx.client.rpc('consultar_cuota_tokens', { p_negocio_id: negocioId });
    if (error) throw error;
    const row = (data as CuotaRow[])[0];
    return { ...row, tokens_usados: Number(row.tokens_usados) };
  };

  afterAll(() => ctx.cleanup());

  it('IT-DB-14 registrar_consumo_ia suma tokens y consultar_cuota_tokens lo refleja', async () => {
    const { negocio } = await ctx.createUserWithNegocio('negocio_cuota');
    const planId = await ctx.createPlan('plan_cuota', { limiteTokens: 200 });
    const suscripciones = new SupabaseSuscripcionRepository(ctx.service);
    const suscripcion = await suscripciones.crear({ negocioId: negocio.id, planId });

    // Sin suscripción activa no hay cuota, y el consumo se registra igual en consumo_ia.
    expect(await consultarCuota(negocio.id)).toMatchObject({ hay_suscripcion: false, tokens_usados: 0 });

    const ahora = Date.now();
    await suscripciones.actualizarEstado(suscripcion.id, 'activa', {
      fechaInicio: new Date(ahora - 24 * 3600 * 1000),
      fechaFin: new Date(ahora + 20 * 24 * 3600 * 1000),
    });
    const conversacion = await ctx.createConversation(negocio.id);

    expect(await consultarCuota(negocio.id)).toEqual({ hay_suscripcion: true, limite_tokens: 200, tokens_usados: 0 });
    expect(await cuota.hasQuota(negocio.id)).toBe(true);

    await consumo.record({
      businessId: negocio.id,
      conversationId: conversacion.id,
      tokensInput: 100,
      tokensOutput: 50,
      model: 'it-modelo-principal',
    });
    expect((await consultarCuota(negocio.id)).tokens_usados).toBe(150);
    expect(await cuota.hasQuota(negocio.id)).toBe(true);

    await consumo.record({ businessId: negocio.id, conversationId: conversacion.id, tokensInput: 40, tokensOutput: 10 });
    expect((await consultarCuota(negocio.id)).tokens_usados).toBe(200);
    expect(await cuota.hasQuota(negocio.id)).toBe(false); // alcanzó el límite

    const { data: filas, error } = await ctx.client
      .from('consumo_ia')
      .select('tokens_entrada, tokens_salida, modelo, conversacion_id')
      .eq('negocio_id', negocio.id)
      .order('created_at', { ascending: true });
    expect(error).toBeNull();
    expect(filas).toEqual([
      { tokens_entrada: 100, tokens_salida: 50, modelo: 'it-modelo-principal', conversacion_id: conversacion.id },
      { tokens_entrada: 40, tokens_salida: 10, modelo: null, conversacion_id: conversacion.id },
    ]);

    const { data: contadores } = await ctx.client
      .from('contador_uso_periodo')
      .select('suscripcion_id, tokens_usados')
      .eq('negocio_id', negocio.id);
    expect(contadores).toHaveLength(1);
    expect(contadores![0].suscripcion_id).toBe(suscripcion.id);
    expect(Number(contadores![0].tokens_usados)).toBe(200);
  });
});
