import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { AgentConfigMapper, ConfiguracionAgenteRow } from './agent-config.mapper';

@Injectable()
export class SupabaseAgentConfigRepository implements AgentConfigRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findByBusinessId(businessId: string): Promise<AgentConfig | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('configuracion_agente')
      .select('*')
      .eq('negocio_id', businessId)
      .maybeSingle<ConfiguracionAgenteRow>();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return AgentConfigMapper.toDomain(data);
  }

  async save(config: AgentConfig): Promise<void> {
    const client = this.supabaseService.getClient();

    // El mapper no incluye created_at: en un insert nuevo lo llena el DEFAULT now() de la
    // tabla; en una actualización (conflicto por negocio_id) no debe tocarse.
    const { error } = await client
      .from('configuracion_agente')
      .upsert(AgentConfigMapper.toPersistence(config), { onConflict: 'negocio_id' });

    if (error) {
      throw error;
    }
  }
}
