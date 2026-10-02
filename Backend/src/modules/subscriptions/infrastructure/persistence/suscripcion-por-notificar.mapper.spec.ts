import { SuscripcionPorNotificarMapper } from './suscripcion-por-notificar.mapper';
import type { SuscripcionPorNotificarRow } from './suscripcion-por-notificar.mapper';

const fila = (overrides: Partial<SuscripcionPorNotificarRow> = {}): SuscripcionPorNotificarRow => ({
  id: 'sus-1',
  negocio_id: 'neg-1',
  fecha_fin: '2026-10-04T13:00:00+00:00',
  negocios: { usuario_id: 'user-1', nombre_negocio: 'Tienda', deleted_at: null },
  planes: { nombre: 'Pro' },
  ...overrides,
});

describe('SuscripcionPorNotificarMapper', () => {
  it('convierte la fila con negocio y plan', () => {
    expect(SuscripcionPorNotificarMapper.toDomain(fila())).toMatchObject({
      suscripcionId: 'sus-1',
      negocioId: 'neg-1',
      usuarioId: 'user-1',
      nombreNegocio: 'Tienda',
      nombrePlan: 'Pro',
      fechaFin: new Date('2026-10-04T13:00:00.000Z'),
    });
  });

  it('descarta los negocios eliminados (soft delete)', () => {
    const eliminado = fila({ negocios: { usuario_id: 'user-1', nombre_negocio: 'Tienda', deleted_at: '2026-09-01T00:00:00+00:00' } });

    expect(SuscripcionPorNotificarMapper.toDomainList([eliminado, fila({ id: 'sus-2' })])).toHaveLength(1);
  });

  it('usa un nombre genérico si el plan no viene en la fila', () => {
    expect(SuscripcionPorNotificarMapper.toDomain(fila({ planes: null }))?.nombrePlan).toBe('tu plan');
  });
});
