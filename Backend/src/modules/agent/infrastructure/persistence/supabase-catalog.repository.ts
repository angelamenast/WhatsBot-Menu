import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { CatalogItem, CatalogRepository } from '../../domain/repositories/catalog.repository';

interface CatalogoProductoRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  categorias_producto: { nombre: string } | null;
}

@Injectable()
export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAvailableByBusinessId(businessId: string): Promise<CatalogItem[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('catalogo_productos')
      .select('id, nombre, descripcion, precio, disponible, categorias_producto(nombre)')
      .eq('negocio_id', businessId)
      .eq('disponible', true)
      .is('deleted_at', null)
      .returns<CatalogoProductoRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.nombre,
      description: row.descripcion,
      price: row.precio,
      available: row.disponible,
      categoryName: row.categorias_producto?.nombre ?? null,
    }));
  }
}