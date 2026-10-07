import {
  calcularDiasRestantes,
  calcularEstadoAcceso,
  puedeEditar,
  puedeUsarAgente,
} from './estado-acceso';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-10-01T12:00:00.000Z');
const enDias = (dias: number) => new Date(AHORA.getTime() + dias * DIA);

describe('calcularEstadoAcceso', () => {
  it('SIN_PLAN cuando el negocio no tiene suscripción', () => {
    expect(calcularEstadoAcceso(null, AHORA)).toBe('SIN_PLAN');
  });

  it('ACTIVO cuando faltan más de 3 días', () => {
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin: enDias(10) }, AHORA)).toBe('ACTIVO');
  });

  it('ACTIVO un milisegundo antes del umbral de 3 días', () => {
    const fechaFin = new Date(enDias(3).getTime() + 1);
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin }, AHORA)).toBe('ACTIVO');
  });

  it('POR_VENCER cuando faltan exactamente 3 días', () => {
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin: enDias(3) }, AHORA)).toBe('POR_VENCER');
  });

  it('POR_VENCER cuando falta menos de un día', () => {
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin: enDias(0.5) }, AHORA)).toBe('POR_VENCER');
  });

  it('VENCIDO cuando fecha_fin es exactamente ahora', () => {
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin: AHORA }, AHORA)).toBe('VENCIDO');
  });

  it('VENCIDO si sigue "activa" pero fecha_fin ya pasó (el job aún no corrió)', () => {
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin: enDias(-1) }, AHORA)).toBe('VENCIDO');
  });

  it('VENCIDO cuando la suscripción está marcada como vencida', () => {
    expect(calcularEstadoAcceso({ estado: 'vencida', fechaFin: enDias(-5) }, AHORA)).toBe('VENCIDO');
  });

  it('VENCIDO si está activa sin fecha_fin (falla cerrado)', () => {
    expect(calcularEstadoAcceso({ estado: 'activa', fechaFin: null }, AHORA)).toBe('VENCIDO');
  });

  it.each(['cancelada', 'pendiente'] as const)('SIN_PLAN con estado %s', (estado) => {
    expect(calcularEstadoAcceso({ estado, fechaFin: enDias(10) }, AHORA)).toBe('SIN_PLAN');
  });
});

describe('calcularDiasRestantes', () => {
  it('redondea hacia arriba los días parciales', () => {
    expect(calcularDiasRestantes(enDias(2.5), AHORA)).toBe(3);
  });

  it('nunca es negativo', () => {
    expect(calcularDiasRestantes(enDias(-4), AHORA)).toBe(0);
  });

  it('es null sin fecha_fin', () => {
    expect(calcularDiasRestantes(null, AHORA)).toBeNull();
  });
});

describe('permisos por estado', () => {
  it.each([
    ['ACTIVO', true, true],
    ['POR_VENCER', true, true],
    ['VENCIDO', false, false],
    ['SIN_PLAN', false, true],
  ] as const)('%s → agente=%s, edición=%s', (estado, agente, edicion) => {
    expect(puedeUsarAgente(estado)).toBe(agente);
    expect(puedeEditar(estado)).toBe(edicion);
  });
});
