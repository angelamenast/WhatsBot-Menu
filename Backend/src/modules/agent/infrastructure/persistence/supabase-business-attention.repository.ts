import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import {
  BusinessAttentionRepository,
  BusinessAttentionStatus,
} from '../../domain/repositories/business-attention.repository';
import { BusinessNotFoundError } from '../../domain/errors/agent.errors';

interface NegocioAtencionRow {
  atencion_automatica_activa: boolean;
  estado: string;
  deleted_at: string | null;
}

@Injectable()
export class SupabaseBusinessAttentionRepository implements BusinessAttentionRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getStatus(businessId: string): Promise<BusinessAttentionStatus> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('negocios')
      .select('atencion_automatica_activa, estado, deleted_at')
      .eq('id', businessId)
      .maybeSingle<NegocioAtencionRow>();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new BusinessNotFoundError(businessId);
    }

    return {
      autoAttentionActive: data.atencion_automatica_activa,
      businessActive: data.estado === 'activo' && data.deleted_at === null,
    };
  }
}
