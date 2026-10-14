import { Suscripcion } from '../../../payments/domain/entities/suscripcion.entity';
import type { EstadoSuscripcion } from '../../../payments/domain/entities/suscripcion.entity';
import { Plan } from '../../../payments/domain/entities/plan.entity';
import type { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';

interface PlanRow {
  id: string;
  nombre: string;
  precio: number | string;
  limite_mensajes: number | null;
  limite_tokens: number | null;
}

export interface SuscripcionVigenteRow {
  id: string;
  negocio_id: string;
  plan_id: string;
  estado: EstadoSuscripcion;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  planes: PlanRow | null;
}

const aFecha = (valor: string | null): Date | null => (valor ? new Date(valor) : null);

export class SuscripcionVigenteMapper {
  static toDomain(row: SuscripcionVigenteRow): SuscripcionVigente {
    return {
      suscripcion: new Suscripcion(
        row.id,
        row.negocio_id,
        row.plan_id,
        row.estado,
        aFecha(row.fecha_inicio),
        aFecha(row.fecha_fin),
      ),
      plan: row.planes
        ? new Plan(
            row.planes.id,
            row.planes.nombre,
            Number(row.planes.precio),
            row.planes.limite_mensajes,
            row.planes.limite_tokens,
          )
        : null,
    };
  }
}
