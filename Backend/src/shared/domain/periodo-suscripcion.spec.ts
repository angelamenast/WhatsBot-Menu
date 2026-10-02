import { calcularNuevaFechaFin, formatearFechaColombia, sumarMeses } from './periodo-suscripcion';

const iso = (fecha: Date) => fecha.toISOString();

describe('sumarMeses', () => {
  it('suma un mes conservando el día y la hora', () => {
    expect(iso(sumarMeses(new Date('2026-10-15T15:00:00.000Z'), 1))).toBe('2026-11-15T15:00:00.000Z');
  });

  it('pasa al año siguiente desde diciembre', () => {
    expect(iso(sumarMeses(new Date('2026-12-15T15:00:00.000Z'), 1))).toBe('2027-01-15T15:00:00.000Z');
  });

  it('31-ene + 1 mes = 28-feb en año no bisiesto (no 3-mar)', () => {
    expect(iso(sumarMeses(new Date('2027-01-31T15:00:00.000Z'), 1))).toBe('2027-02-28T15:00:00.000Z');
  });

  it('31-ene + 1 mes = 29-feb en año bisiesto', () => {
    expect(iso(sumarMeses(new Date('2028-01-31T15:00:00.000Z'), 1))).toBe('2028-02-29T15:00:00.000Z');
  });

  it('usa el calendario de Colombia: 30-ene 23:30 (COT) + 1 mes = 28-feb 23:30 (COT)', () => {
    // 2027-01-31T04:30Z es 30-ene 23:30 en Colombia; en UTC ya sería 31-ene.
    expect(iso(sumarMeses(new Date('2027-01-31T04:30:00.000Z'), 1))).toBe('2027-03-01T04:30:00.000Z');
  });
});

describe('calcularNuevaFechaFin', () => {
  const AHORA = new Date('2026-10-01T15:00:00.000Z');

  it('con plan vigente suma el periodo a la fecha_fin actual (no pierde días)', () => {
    const fechaFin = new Date('2026-10-20T15:00:00.000Z');
    expect(iso(calcularNuevaFechaFin(fechaFin, AHORA))).toBe('2026-11-20T15:00:00.000Z');
  });

  it('con plan vencido cuenta el periodo desde ahora', () => {
    const fechaFin = new Date('2026-09-10T15:00:00.000Z');
    expect(iso(calcularNuevaFechaFin(fechaFin, AHORA))).toBe('2026-11-01T15:00:00.000Z');
  });

  it('sin fecha_fin cuenta desde ahora', () => {
    expect(iso(calcularNuevaFechaFin(null, AHORA))).toBe('2026-11-01T15:00:00.000Z');
  });

  it('si fecha_fin es exactamente ahora cuenta desde ahora', () => {
    expect(iso(calcularNuevaFechaFin(AHORA, AHORA))).toBe('2026-11-01T15:00:00.000Z');
  });
});

describe('formatearFechaColombia', () => {
  it('formatea en la fecha de Colombia, no en la de UTC', () => {
    // 03:00 UTC del 16-oct todavía es 15-oct en Colombia.
    expect(formatearFechaColombia(new Date('2026-10-16T03:00:00.000Z'))).toBe('2026-10-15');
  });
});
