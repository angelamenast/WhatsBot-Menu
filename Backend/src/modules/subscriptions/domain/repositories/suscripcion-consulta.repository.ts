import { SuscripcionVigente } from '../entities/suscripcion-vigente.entity';

export interface SuscripcionConsultaRepository {
  buscarNegocioIdPorUsuario(usuarioId: string): Promise<string | null>;
  buscarVigentePorNegocio(negocioId: string): Promise<SuscripcionVigente | null>;
}

export const SUSCRIPCION_CONSULTA_REPOSITORY = Symbol('SUSCRIPCION_CONSULTA_REPOSITORY');
