import { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';
import type { EstadoSuscripcion } from '../../domain/entities/suscripcion-vigente.entity';

interface PlanRow {
  id: string;
  nombre: string;
  precio: number | string;
}

export interface SuscripcionVigenteRow {
  id: string;
  negocio_id: string;
  estado: EstadoSuscripcion;
  fecha_fin: string | null;
  planes: PlanRow | null;
}

export class SuscripcionVigenteMapper {
  static toDomain(row: SuscripcionVigenteRow): SuscripcionVigente {
    return new SuscripcionVigente(
      row.id,
      row.negocio_id,
      row.estado,
      row.fecha_fin ? new Date(row.fecha_fin) : null,
      row.planes
        ? { id: row.planes.id, nombre: row.planes.nombre, precio: Number(row.planes.precio) }
        : null,
    );
  }
}
