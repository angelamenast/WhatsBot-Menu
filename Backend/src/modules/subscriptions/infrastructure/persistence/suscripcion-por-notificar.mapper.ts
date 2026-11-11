import { SuscripcionPorNotificar } from '../../domain/entities/suscripcion-por-notificar.entity';

export interface SuscripcionPorNotificarRow {
  id: string;
  negocio_id: string;
  fecha_fin: string;
  negocios: { usuario_id: string; nombre_negocio: string; deleted_at: string | null } | null;
  planes: { nombre: string } | null;
}

export class SuscripcionPorNotificarMapper {
  // Los negocios eliminados (soft delete) no reciben correos: se devuelve null y se descartan.
  static toDomain(row: SuscripcionPorNotificarRow): SuscripcionPorNotificar | null {
    if (!row.negocios || row.negocios.deleted_at) {
      return null;
    }

    return new SuscripcionPorNotificar(
      row.id,
      row.negocio_id,
      row.negocios.usuario_id,
      row.negocios.nombre_negocio,
      row.planes?.nombre ?? 'tu plan',
      new Date(row.fecha_fin),
    );
  }

  static toDomainList(rows: SuscripcionPorNotificarRow[]): SuscripcionPorNotificar[] {
    return rows.map((row) => this.toDomain(row)).filter((s): s is SuscripcionPorNotificar => s !== null);
  }
}
