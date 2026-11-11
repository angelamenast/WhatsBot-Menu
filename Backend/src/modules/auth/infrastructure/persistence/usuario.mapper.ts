import { Usuario } from '../../domain/entities/usuario.entity';

interface UsuarioRow {
  id: string;
  nombre: string;
  telefono: string | null;
}

export class UsuarioMapper {
  static toDomain(row: UsuarioRow): Usuario {
    return new Usuario(row.id, row.nombre, row.telefono);
  }

  static toInsert(id: string, nombre: string, telefono: string | null) {
    return {
      id,
      nombre,
      telefono,
    };
  }
}