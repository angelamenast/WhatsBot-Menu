export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  /** false = agotado: el agente lo conoce y puede informarlo, pero no debe ofrecerlo para pedir. */
  available: boolean;
  categoryName: string | null;
}

/** Tope de productos que entran al contexto del agente. Al superarlo se priorizan los disponibles. */
export const MAX_CATALOG_ITEMS = 200;

/**
 * Puerto de solo lectura hacia el catálogo del negocio.
 * Devuelve TODOS los productos no eliminados del negocio (disponibles y agotados, con su flag
 * `available`), hasta MAX_CATALOG_ITEMS: primero los disponibles y, dentro de cada grupo,
 * agrupados por categoría y nombre.
 *
 * El agente mantiene su propia lectura sobre `catalogo_productos` y no depende del módulo
 * `business`: si el catálogo se mueve, solo se reemplaza el adapter y esta interfaz no cambia.
 */
export interface CatalogRepository {
  findByBusinessId(businessId: string): Promise<CatalogItem[]>;
}

export const CATALOG_REPOSITORY = Symbol('CatalogRepository');
