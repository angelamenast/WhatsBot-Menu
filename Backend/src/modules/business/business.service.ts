import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@Injectable()
export class BusinessService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(usuarioId: string, dto: CreateBusinessDto) {
    const client = this.supabaseService.getClient();

    // MVP trata la relación como 1:1 — evita que un usuario cree más de un negocio
    const { data: existentes, error: checkError } = await client
      .from('negocios')
      .select('id')
      .eq('usuario_id', usuarioId)
      .is('deleted_at', null);

    if (checkError) {
      throw new BadRequestException('No se pudo verificar negocios existentes');
    }

    if (existentes && existentes.length > 0) {
      throw new ForbiddenException('Ya tienes un negocio registrado');
    }

    const { data, error } = await client
      .from('negocios')
      .insert({
        usuario_id: usuarioId,
        nombre_negocio: dto.nombre_negocio,
        descripcion: dto.descripcion ?? null,
        estado: 'activo',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException('No se pudo crear el negocio');
    }

    return data;
  }

  async findByUsuario(usuarioId: string) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('negocios')
      .select('*')
      .eq('usuario_id', usuarioId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new BadRequestException('No se pudo obtener el negocio');
    }

    return data;
  }
}