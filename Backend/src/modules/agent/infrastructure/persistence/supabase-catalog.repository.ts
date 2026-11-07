import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import {
  CatalogItem,
  CatalogRepository,
  MAX_CATALOG_ITEMS,
} from '../../domain/repositories/catalog.repository';

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
  private readonly logger = new Logger(SupabaseCatalogRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async findByBusinessId(businessId: string): Promise<CatalogItem[]> {
    const client = this.supabaseService.getClient();

    // Se piden MAX + 1 filas para detectar el truncado. El orden en BD deja primero los
    // disponibles: lo que se corta al truncar son los agotados.
    const { data, error } = await client
      .from('catalogo_productos')
      .select('id, nombre, descripcion, precio, disponible, categorias_producto(nombre)')
      .eq('negocio_id', businessId)
      .is('deleted_at', null)
      .order('disponible', { ascending: false })
      .order('categoria_id', { ascending: true, nullsFirst: false })
      .order('nombre', { ascending: true })
      .order('id', { ascending: true })
      .limit(MAX_CATALOG_ITEMS + 1)
      .returns<CatalogoProductoRow[]>();

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const truncated = rows.length > MAX_CATALOG_ITEMS;

    if (truncated) {
      this.logger.warn(
        `Catálogo del negocio ${businessId} truncado a ${MAX_CATALOG_ITEMS} productos (se priorizaron los disponibles)`,
      );
    }

    return rows
      .slice(0, MAX_CATALOG_ITEMS)
      .map((row) => ({
        id: row.id,
        name: row.nombre,
        description: row.descripcion,
        price: row.precio,
        available: row.disponible,
        categoryName: row.categorias_producto?.nombre ?? null,
      }))
      .sort(compareCatalogItems);
  }
}

// Disponibles primero; luego por categoría (sin categoría al final), nombre e id (orden estable).
function compareCatalogItems(a: CatalogItem, b: CatalogItem): number {
  if (a.available !== b.available) {
    return a.available ? -1 : 1;
  }
  if (a.categoryName !== b.categoryName) {
    if (a.categoryName === null) return 1;
    if (b.categoryName === null) return -1;
    return a.categoryName.localeCompare(b.categoryName, 'es');
  }
  return a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
}
