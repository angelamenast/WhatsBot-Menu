import { Category } from '../entities/category.entity';

export interface CategoryRepository {
  listByBusiness(businessId: string): Promise<Category[]>;
  createMany(businessId: string, names: string[]): Promise<Category[]>;
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');