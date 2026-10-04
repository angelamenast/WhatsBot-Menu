import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import {
  CatalogLookupRepository,
  CatalogProductSnapshot,
} from '../../domain/repositories/catalog-lookup.repository';

interface CatalogoProductoRow {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
}

@Injectable()
export class SupabaseCatalogLookupRepository implements CatalogLookupRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findManyByIds(
    businessId: string,
    productIds: string[],
  ): Promise<CatalogProductSnapshot[]> {
    if (productIds.length === 0) {
      return [];
    }

    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('catalogo_productos')
      .select('id, nombre, precio, disponible')
      .eq('negocio_id', businessId)
      .in('id', productIds)
      .is('deleted_at', null)
      .returns<CatalogoProductoRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.nombre,
      price: row.precio,
      available: row.disponible,
    }));
  }
}
