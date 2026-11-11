import { SupabasePlanRepository } from '../../src/modules/payments/infrastructure/persistence/supabase-plan.repository';
import { SupabaseSuscripcionRepository } from '../../src/modules/payments/infrastructure/persistence/supabase-suscripcion.repository';
import { SupabaseTransaccionPagoRepository } from '../../src/modules/payments/infrastructure/persistence/supabase-transaccion-pago.repository';
import { SupabaseSuscripcionConsultaRepository } from '../../src/modules/subscriptions/infrastructure/persistence/supabase-suscripcion-consulta.repository';
import type { EstadoSuscripcion } from '../../src/modules/payments/domain/entities/suscripcion.entity';
import type { EstadoTransaccion } from '../../src/modules/payments/domain/entities/transaccion-pago.entity';
import { TestContext } from './support/test-context';

describe('Persistencia: planes, suscripciones y pagos (Supabase real)', () => {
  const ctx = new TestContext();
  const planes = new SupabasePlanRepository(ctx.service);
  const suscripciones = new SupabaseSuscripcionRepository(ctx.service);
  const transacciones = new SupabaseTransaccionPagoRepository(ctx.service);
  const consulta = new SupabaseSuscripcionConsultaRepository(ctx.service);

  let negocioId: string;
  let planAnualId: string;
  let suscripcionId: string;
  let transaccionId: string;
  const referencia = () => ctx.name('ref_wompi');

  beforeAll(async () => {
    ({
      negocio: { id: negocioId },
    } = await ctx.createUserWithNegocio('negocio_pagos'));
    planAnualId = await ctx.createPlan('plan_anual', { precio: 480000, duracionMeses: 12 });
  });

  afterAll(() => ctx.cleanup());

  it('IT-DB-05 lista los planes activos con duracion_meses', async () => {
    const planInactivoId = await ctx.createPlan('plan_inactivo', { activo: false, duracionMeses: 3 });

    const activos = await planes.obtenerTodos();

    const anual = activos.find((p) => p.id === planAnualId);
    expect(anual).toBeDefined();
    expect(anual!.duracionMeses).toBe(12);
    expect(anual!.precio).toBe(480000);
    expect(activos.some((p) => p.id === planInactivoId)).toBe(false);
    // Ordenados por precio ascendente.
    const precios = activos.map((p) => p.precio);
    expect(precios).toEqual([...precios].sort((x, y) => x - y));

    // buscarPorId devuelve también los inactivos, con su duración.
    const inactivo = await planes.buscarPorId(planInactivoId);
    expect(inactivo).toMatchObject({ activo: false, duracionMeses: 3 });
  });

  it('IT-DB-06 crea suscripción y transacción pendientes y encuentra la transacción por referencia_wompi', async () => {
    const suscripcion = await suscripciones.crear({ negocioId, planId: planAnualId });
    suscripcionId = suscripcion.id;
    expect(suscripcion.estado).toBe('pendiente');

    const transaccion = await transacciones.crear({
      suscripcionId,
      referenciaWompi: referencia(),
      monto: 480000,
    });
    transaccionId = transaccion.id;

    const encontrada = await transacciones.buscarPorReferencia(referencia());
    expect(encontrada).not.toBeNull();
    expect(encontrada!.id).toBe(transaccionId);
    expect(encontrada!.suscripcionId).toBe(suscripcionId);
    expect(encontrada!.estado).toBe('pendiente');
    expect(Number(encontrada!.monto)).toBe(480000);

    expect(await transacciones.buscarPorReferencia(ctx.name('ref_inexistente'))).toBeNull();
    // Una suscripción pendiente no da acceso.
    expect(await consulta.buscarVigentePorNegocio(negocioId)).toBeNull();
  });

  it('IT-DB-07 pasa a aprobado/activa y persiste fecha_fin', async () => {
    const fechaInicio = new Date('2026-11-01T05:00:00.000Z');
    const fechaFin = new Date('2027-11-01T05:00:00.000Z');

    await transacciones.actualizarEstado(transaccionId, 'aprobado');
    await suscripciones.actualizarEstado(suscripcionId, 'activa', { fechaInicio, fechaFin });

    expect((await transacciones.buscarPorReferencia(referencia()))!.estado).toBe('aprobado');

    const suscripcion = await suscripciones.buscarPorId(suscripcionId);
    expect(suscripcion!.estado).toBe('activa');
    expect(suscripcion!.fechaInicio!.getTime()).toBe(fechaInicio.getTime());
    expect(suscripcion!.fechaFin!.getTime()).toBe(fechaFin.getTime());

    const vigente = await consulta.buscarVigentePorNegocio(negocioId);
    expect(vigente!.suscripcion.id).toBe(suscripcionId);
    expect(vigente!.suscripcion.fechaFin!.getTime()).toBe(fechaFin.getTime());
    expect(vigente!.plan).toMatchObject({ id: planAnualId, duracionMeses: 12 });
  });

  it('IT-DB-08 la BD rechaza estados inválidos (CHECK de transacciones_pago y suscripciones)', async () => {
    await expect(
      transacciones.actualizarEstado(transaccionId, 'pagado' as EstadoTransaccion),
    ).rejects.toThrow(/transacciones_pago_estado_check/);
    await expect(
      suscripciones.actualizarEstado(suscripcionId, 'pagada' as EstadoSuscripcion),
    ).rejects.toThrow(/suscripciones_estado_check/);

    // El estado anterior se conserva.
    expect((await transacciones.buscarPorReferencia(referencia()))!.estado).toBe('aprobado');
    expect((await suscripciones.buscarPorId(suscripcionId))!.estado).toBe('activa');
  });
});
