import { Injectable } from '@nestjs/common';
import { CatalogItem, CatalogRepository } from '../../domain/repositories/catalog.repository';

const SAMPLE_CATALOG: CatalogItem[] = [
  {
    id: 'fake-product-1',
    name: 'Hamburguesa clásica',
    description: 'Carne de res, queso, lechuga y tomate',
    price: 18000,
    available: true,
    categoryName: 'Hamburguesas',
  },
  {
    id: 'fake-product-2',
    name: 'Papas fritas',
    description: 'Porción grande con salsas',
    price: 8000,
    available: true,
    categoryName: 'Acompañamientos',
  },
  {
    id: 'fake-product-3',
    name: 'Limonada natural',
    description: null,
    price: 6000,
    available: true,
    categoryName: 'Bebidas',
  },
];

@Injectable()
export class FakeCatalogRepository implements CatalogRepository {
  async findAvailableByBusinessId(_businessId: string): Promise<CatalogItem[]> {
    return SAMPLE_CATALOG.filter((item) => item.available).map((item) => ({ ...item }));
  }
}
