import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AgentConfig } from '../../domain/entities/agent-config.entity';

interface ConfiguracionAgenteRow {
  id: string;
  negocio_id: string;
  personalidad: string | null;
  tono: string | null;
  mensaje_bienvenida: string | null;
  horario_atencion: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

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

    return AgentConfig.create({
      id: data.id,
      businessId: data.negocio_id,
      personality: data.personalidad,
      tone: data.tono,
      welcomeMessage: data.mensaje_bienvenida,
      businessHours: data.horario_atencion,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    });
  }
}