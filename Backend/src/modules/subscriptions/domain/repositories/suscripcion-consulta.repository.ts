import type { SuscripcionVigente } from '../entities/suscripcion-vigente.entity';

// Consulta propia de este módulo: el repositorio de suscripciones de payments solo busca por id.
// El negocio del usuario se resuelve con NEGOCIO_REPOSITORY (módulo business).
export interface SuscripcionConsultaRepository {
  buscarVigentePorNegocio(negocioId: string): Promise<SuscripcionVigente | null>;
}

export const SUSCRIPCION_CONSULTA_REPOSITORY = Symbol('SUSCRIPCION_CONSULTA_REPOSITORY');
