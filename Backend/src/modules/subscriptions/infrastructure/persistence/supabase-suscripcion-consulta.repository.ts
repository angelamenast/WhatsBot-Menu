import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';
import { SuscripcionVigenteMapper } from './suscripcion-vigente.mapper';
import type { SuscripcionVigenteRow } from './suscripcion-vigente.mapper';

// Solo lectura sobre negocios/suscripciones/planes: la escritura sigue en el módulo payments.
// El cliente usa la service role key (salta RLS), por eso toda consulta filtra por negocio.
@Injectable()
export class SupabaseSuscripcionConsultaRepository implements SuscripcionConsultaRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async buscarNegocioIdPorUsuario(usuarioId: string): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('negocios')
      .select('id')
      .eq('usuario_id', usuarioId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data?.id ?? null;
  }

  async buscarVigentePorNegocio(negocioId: string): Promise<SuscripcionVigente | null> {
    // "Vigente" = la de mayor fecha_fin entre activa/vencida. Las pendientes de pago
    // y las canceladas no dan acceso.
    const { data, error } = await this.supabaseService
      .getClient()
      .from('suscripciones')
      .select('id, negocio_id, estado, fecha_fin, planes ( id, nombre, precio )')
      .eq('negocio_id', negocioId)
      .in('estado', ['activa', 'vencida'])
      .order('fecha_fin', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? SuscripcionVigenteMapper.toDomain(data as unknown as SuscripcionVigenteRow) : null;
  }
}
