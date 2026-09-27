import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { PlanRepository } from '../../domain/repositories/plan.repository';
import { Plan } from '../../domain/entities/plan.entity';

@Injectable()
export class SupabasePlanRepository implements PlanRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async buscarPorId(id: string): Promise<Plan | null> {
    const { data, error } = await this.supabaseService.getClient()
      .from('planes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return new Plan(data.id, data.nombre, data.precio, data.limite_mensajes, data.limite_tokens);
  }
}