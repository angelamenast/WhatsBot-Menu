export interface CatalogProductSnapshot {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

/**
 * Puerto de solo lectura hacia el catálogo real del negocio, usado para validar
 * los items de un pedido antes de crearlo (existencia + disponibilidad). orders
 * nunca confía en el nombre/precio que le llegue desde quien pide crear el
 * pedido (agent, o cualquier otro futuro invocador) — siempre relee la verdad
 * actual del catálogo.
 */
export interface CatalogLookupRepository {
  findManyByIds(
    businessId: string,
    productIds: string[],
  ): Promise<CatalogProductSnapshot[]>;
}

export const CATALOG_LOOKUP_REPOSITORY = Symbol('CatalogLookupRepository');
