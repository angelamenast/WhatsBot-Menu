import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { SuscripcionRepository, CrearSuscripcionData, ActivarSuscripcionData } from '../../domain/repositories/suscripcion.repository';
import { Suscripcion, EstadoSuscripcion } from '../../domain/entities/suscripcion.entity';

@Injectable()
export class SupabaseSuscripcionRepository implements SuscripcionRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async crear(data: CrearSuscripcionData): Promise<Suscripcion> {
    const { data: row, error } = await this.supabaseService.getClient()
      .from('suscripciones')
      .insert({
        negocio_id: data.negocioId,
        plan_id: data.planId,
        estado: 'pendiente',
        fecha_inicio: new Date().toISOString(),
        fecha_fin: new Date().toISOString(), // placeholder hasta que se active
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return new Suscripcion(row.id, row.negocio_id, row.plan_id, row.estado, new Date(row.fecha_inicio), new Date(row.fecha_fin));
  }

  async buscarPorId(id: string): Promise<Suscripcion | null> {
    const { data, error } = await this.supabaseService.getClient()
      .from('suscripciones')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return new Suscripcion(data.id, data.negocio_id, data.plan_id, data.estado, new Date(data.fecha_inicio), new Date(data.fecha_fin));
  }

  async actualizarEstado(id: string, estado: EstadoSuscripcion, activacion?: ActivarSuscripcionData): Promise<void> {
    const update: Record<string, unknown> = { estado };

    if (activacion) {
      update.fecha_inicio = activacion.fechaInicio.toISOString();
      update.fecha_fin = activacion.fechaFin.toISOString();
    }

    const { error } = await this.supabaseService.getClient()
      .from('suscripciones')
      .update(update)
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}