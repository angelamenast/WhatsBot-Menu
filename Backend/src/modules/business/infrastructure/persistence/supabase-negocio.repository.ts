import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { NegocioRepository, CrearNegocioData, ActualizarNegocioData } from '../../domain/repositories/negocio.repository';
import { Negocio } from '../../domain/entities/negocio.entity';
import { NegocioMapper } from './negocio.mapper';

@Injectable()
export class SupabaseNegocioRepository implements NegocioRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async existeNegocioActivoPorUsuario(usuarioId: string): Promise<boolean> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('negocios')
      .select('id')
      .eq('usuario_id', usuarioId)
      .is('deleted_at', null);

    if (error) {
      throw new Error(error.message);
    }

    return (data?.length ?? 0) > 0;
  }

  async crear(data: CrearNegocioData): Promise<Negocio> {
    const client = this.supabaseService.getClient();

    const { data: row, error } = await client
      .from('negocios')
      .insert(NegocioMapper.toInsert(data))
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NegocioMapper.toDomain(row);
  }

  async buscarPorUsuario(usuarioId: string): Promise<Negocio | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('negocios')
      .select('*')
      .eq('usuario_id', usuarioId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? NegocioMapper.toDomain(data) : null;
  }

  async actualizar(usuarioId: string, data: ActualizarNegocioData): Promise<Negocio> {
    const client = this.supabaseService.getClient();

    const updateData: any = {};
    if (data.nombreNegocio !== undefined) updateData.nombre_negocio = data.nombreNegocio;
    if (data.numeroWhatsapp !== undefined) updateData.numero_whatsapp = data.numeroWhatsapp;
    if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;

    const { data: row, error } = await client
      .from('negocios')
      .update(updateData)
      .eq('usuario_id', usuarioId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NegocioMapper.toDomain(row);
  }
}