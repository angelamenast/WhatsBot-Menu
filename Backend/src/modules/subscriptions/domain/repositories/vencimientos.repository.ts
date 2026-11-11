import { SuscripcionPorNotificar } from '../entities/suscripcion-por-notificar.entity';

export interface VencimientosRepository {
  // Pasa a 'vencida' las suscripciones activas con fecha_fin <= ahora en una sola operación
  // atómica y devuelve SOLO las que cambió. Si se ejecuta dos veces, la segunda no devuelve
  // nada: es la base de la idempotencia del job.
  marcarVencidas(ahora: Date): Promise<SuscripcionPorNotificar[]>;

  // Suscripciones activas con desde < fecha_fin <= hasta.
  buscarActivasQueVencenEntre(desde: Date, hasta: Date): Promise<SuscripcionPorNotificar[]>;

  // El correo del dueño vive en Supabase Auth, no en la tabla usuarios.
  buscarCorreoDelDueno(usuarioId: string): Promise<string | null>;
}

export const VENCIMIENTOS_REPOSITORY = Symbol('VENCIMIENTOS_REPOSITORY');
