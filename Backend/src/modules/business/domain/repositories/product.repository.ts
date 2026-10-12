import { Product } from '../entities/product.entity';

export interface ListProductsOptions {
  onlyAvailable?: boolean;
}

export interface ProductRepository {
  listByBusiness(businessId: string, options?: ListProductsOptions): Promise<Product[]>;
  // Always scoped by business: the orders module will use this to recompute totals
  // from real prices without being able to touch another business's products.
  findByIds(businessId: string, ids: string[]): Promise<Product[]>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');