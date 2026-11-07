import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { PlanRepository } from '../../domain/repositories/plan.repository';
import { Plan } from '../../domain/entities/plan.entity';

interface PlanRow {
  id: string;
  nombre: string;
  precio: number | string;
  limite_mensajes: number | null;
  limite_tokens: number | null;
  duracion_meses: number;
  activo: boolean;
}

const aPlan = (row: PlanRow): Plan =>
  new Plan(row.id, row.nombre, Number(row.precio), row.limite_mensajes, row.limite_tokens, row.duracion_meses, row.activo);

@Injectable()
export class SupabasePlanRepository implements PlanRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  // Devuelve el plan aunque esté inactivo: las suscripciones existentes lo siguen necesitando
  // (por ejemplo, el webhook lee su duración). Quien venda el plan debe revisar plan.activo.
  async buscarPorId(id: string): Promise<Plan | null> {
    const { data, error } = await this.supabaseService.getClient()
      .from('planes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return aPlan(data);
  }

  // Solo los planes que se pueden comprar.
  async obtenerTodos(): Promise<Plan[]> {
    const { data, error } = await this.supabaseService.getClient()
      .from('planes')
      .select('*')
      .eq('activo', true)
      .order('precio', { ascending: true });

    if (error) throw new Error(error.message);

    return (data || []).map(aPlan);
  }
}
