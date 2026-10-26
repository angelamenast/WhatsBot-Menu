import { Product } from '../entities/product.entity';

export interface ListProductsOptions {
  onlyAvailable?: boolean;
}
export interface NewProductData {
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  imageUrl: string | null;
}

export interface ProductChangeData extends NewProductData {
  id: string;
}

export interface ProductRepository {
  listByBusiness(businessId: string, options?: ListProductsOptions): Promise<Product[]>;
  // Always scoped by business: the orders module will use this to recompute totals
  // from real prices without being able to touch another business's products.
  findByIds(businessId: string, ids: string[]): Promise<Product[]>;
  createMany(businessId: string, products: NewProductData[]): Promise<void>;
  updateMany(businessId: string, products: ProductChangeData[]): Promise<void>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');