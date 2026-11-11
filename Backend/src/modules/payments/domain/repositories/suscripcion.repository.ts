import { Suscripcion, EstadoSuscripcion } from '../entities/suscripcion.entity';

export interface CrearSuscripcionData {
  negocioId: string;
  planId: string;
}

export interface ActivarSuscripcionData {
  fechaInicio: Date;
  fechaFin: Date;
}

export interface SuscripcionRepository {
  crear(data: CrearSuscripcionData): Promise<Suscripcion>;
  buscarPorId(id: string): Promise<Suscripcion | null>;
  actualizarEstado(id: string, estado: EstadoSuscripcion, activacion?: ActivarSuscripcionData): Promise<void>;
}

export const SUSCRIPCION_REPOSITORY = Symbol('SUSCRIPCION_REPOSITORY');