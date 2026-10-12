import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import { Category } from '../../domain/entities/category.entity';
import { CategoryMapper } from './category.mapper';

@Injectable()
export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listByBusiness(businessId: string): Promise<Category[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('categorias_producto')
      .select('id, negocio_id, nombre')
      .eq('negocio_id', businessId)
      .order('nombre', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => CategoryMapper.toDomain(row));
  }
}