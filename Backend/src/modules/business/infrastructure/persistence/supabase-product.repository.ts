import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type {
  ProductRepository,
  ListProductsOptions,
} from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductMapper } from './product.mapper';

@Injectable()
export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listByBusiness(
    businessId: string,
    options: ListProductsOptions = {},
  ): Promise<Product[]> {
    let query = this.supabaseService
      .getClient()
      .from('catalogo_productos')
      .select('*')
      .eq('negocio_id', businessId)
      .is('deleted_at', null)
      .order('nombre', { ascending: true });

    if (options.onlyAvailable) {
      query = query.eq('disponible', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => ProductMapper.toDomain(row));
  }

  async findByIds(businessId: string, ids: string[]): Promise<Product[]> {
    if (ids.length === 0) {
      return [];
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('catalogo_productos')
      .select('*')
      .eq('negocio_id', businessId)
      .is('deleted_at', null)
      .in('id', ids);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => ProductMapper.toDomain(row));
  }
}