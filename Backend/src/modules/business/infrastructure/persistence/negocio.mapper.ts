import { Negocio } from '../../domain/entities/negocio.entity';

interface NegocioRow {
  id: string;
  usuario_id: string;
  nombre_negocio: string;
  numero_whatsapp: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  descripcion: string | null;
}

export class NegocioMapper {
  static toDomain(row: NegocioRow): Negocio {
    return new Negocio(
      row.id,
      row.usuario_id,
      row.nombre_negocio,
      row.numero_whatsapp,
      row.estado,
      row.descripcion,
    );
  }

  static toInsert(data: {
    usuarioId: string;
    nombreNegocio: string;
    numeroWhatsapp: string;
    descripcion: string | null;
  }) {
    return {
      usuario_id: data.usuarioId,
      nombre_negocio: data.nombreNegocio,
      numero_whatsapp: data.numeroWhatsapp,
      descripcion: data.descripcion,
      estado: 'activo',
    };
  }
}