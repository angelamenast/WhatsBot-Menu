export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  categoryName: string | null;
}

/**
 * Puerto de solo lectura hacia el catálogo del negocio.
 * El dominio del catálogo (categorías, productos) le pertenece al módulo `business`,
 * no a `agent`. Mientras `business` no esté implementado, la lectura se hace
 * directamente contra `catalogo_productos`/`categorias_producto` desde un adapter
 * de infraestructura de este módulo; cuando exista el repositorio real de `business`,
 * solo se reemplaza el adapter, esta interfaz no cambia.
 */
export interface CatalogRepository {
  findAvailableByBusinessId(businessId: string): Promise<CatalogItem[]>;
}

export const CATALOG_REPOSITORY = Symbol('CatalogRepository');