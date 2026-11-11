import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { VencimientosRepository } from '../../domain/repositories/vencimientos.repository';
import { SuscripcionPorNotificar } from '../../domain/entities/suscripcion-por-notificar.entity';
import { SuscripcionPorNotificarMapper } from './suscripcion-por-notificar.mapper';
import type { SuscripcionPorNotificarRow } from './suscripcion-por-notificar.mapper';

const COLUMNAS = 'id, negocio_id, fecha_fin, negocios ( usuario_id, nombre_negocio, deleted_at ), planes ( nombre )';

@Injectable()
export class SupabaseVencimientosRepository implements VencimientosRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async marcarVencidas(ahora: Date): Promise<SuscripcionPorNotificar[]> {
    // Un único UPDATE ... WHERE estado = 'activa' ... RETURNING: Postgres bloquea cada fila y
    // vuelve a evaluar el WHERE, así que dos ejecuciones concurrentes nunca devuelven la misma
    // suscripción. Se marcan también las de negocios eliminados; el mapper solo las excluye
    // de las notificaciones.
    const { data, error } = await this.supabaseService
      .getClient()
      .from('suscripciones')
      .update({ estado: 'vencida' })
      .eq('estado', 'activa')
      .lte('fecha_fin', ahora.toISOString())
      .select(COLUMNAS);

    if (error) {
      throw new Error(error.message);
    }

    return SuscripcionPorNotificarMapper.toDomainList((data ?? []) as unknown as SuscripcionPorNotificarRow[]);
  }

  async buscarActivasQueVencenEntre(desde: Date, hasta: Date): Promise<SuscripcionPorNotificar[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('suscripciones')
      .select(COLUMNAS)
      .eq('estado', 'activa')
      .gt('fecha_fin', desde.toISOString())
      .lte('fecha_fin', hasta.toISOString());

    if (error) {
      throw new Error(error.message);
    }

    return SuscripcionPorNotificarMapper.toDomainList((data ?? []) as unknown as SuscripcionPorNotificarRow[]);
  }

  async buscarCorreoDelDueno(usuarioId: string): Promise<string | null> {
    const { data, error } = await this.supabaseService.getClient().auth.admin.getUserById(usuarioId);

    if (error) {
      throw new Error(error.message);
    }

    return data.user?.email ?? null;
  }
}
