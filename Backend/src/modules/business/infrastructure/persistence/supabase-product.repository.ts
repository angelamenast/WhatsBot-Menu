import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type {
  NewProductData,
  ProductChangeData,
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
  async createMany(businessId: string, products: NewProductData[]): Promise<void> {
  if (products.length === 0) {
    return;
  }

  const { error } = await this.supabaseService
    .getClient()
    .from('catalogo_productos')
    .insert(
      products.map((product) => ({
        negocio_id: businessId,
        categoria_id: product.categoryId,
        nombre: product.name,
        descripcion: product.description,
        precio: product.price,
        disponible: product.available,
        imagen_url: product.imageUrl,
      })),
    );

  if (error) {
    throw new Error(error.message);
  }
}

// One bulk upsert by id. The ids come from the business's own products, never from the client.
async updateMany(businessId: string, products: ProductChangeData[]): Promise<void> {
  if (products.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  const { error } = await this.supabaseService
    .getClient()
    .from('catalogo_productos')
    .upsert(
      products.map((product) => ({
        id: product.id,
        negocio_id: businessId,
        categoria_id: product.categoryId,
        nombre: product.name,
        descripcion: product.description,
        precio: product.price,
        disponible: product.available,
        imagen_url: product.imageUrl,
        updated_at: now,
      })),
      { onConflict: 'id' },
    );

  if (error) {
    throw new Error(error.message);
  }
} 
}