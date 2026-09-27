import { Negocio } from '../entities/negocio.entity';

export interface CrearNegocioData {
  usuarioId: string;
  nombreNegocio: string;
  numeroWhatsapp: string;
  descripcion: string | null;
}

export interface NegocioRepository {
  existeNegocioActivoPorUsuario(usuarioId: string): Promise<boolean>;
  crear(data: CrearNegocioData): Promise<Negocio>;
  buscarPorUsuario(usuarioId: string): Promise<Negocio | null>;
}

export const NEGOCIO_REPOSITORY = Symbol('NEGOCIO_REPOSITORY');