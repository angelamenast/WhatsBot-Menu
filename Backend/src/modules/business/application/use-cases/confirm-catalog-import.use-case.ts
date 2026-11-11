import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository'; // existing name
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository'; // existing name
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import { CATEGORY_REPOSITORY } from '../../domain/repositories/category.repository';
import type {
  NewProductData,
  ProductChangeData,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import { PRODUCT_REPOSITORY } from '../../domain/repositories/product.repository';
import { ConfirmCatalogImportCommand } from '../dto/confirm-catalog-import.command';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors'; // existing name
import { CatalogImportRejectedError, CatalogTooLargeError } from '../../domain/errors/catalog-import.errors';
import { planCatalogImport } from '../../domain/services/plan-catalog-import';
import { normalizeName } from '../../domain/services/normalize-name';
import { MAX_ROWS_PER_SHEET } from './preview-catalog-import.use-case';

export interface CatalogImportResult {
  categoriesCreated: number;
  productsCreated: number;
  productsUpdated: number;
  productsUnchanged: number;
}

@Injectable()
export class ConfirmCatalogImportUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY) private readonly businessRepository: NegocioRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: CategoryRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository,
  ) {}

  async execute(command: ConfirmCatalogImportCommand): Promise<CatalogImportResult> {
    const business = await this.businessRepository.buscarPorUsuario(command.userId);
    if (!business) {
      throw new NegocioNoEncontradoError();
    }

    const { input } = command;
    if (input.categories.length > MAX_ROWS_PER_SHEET || input.products.length > MAX_ROWS_PER_SHEET) {
      throw new CatalogTooLargeError(MAX_ROWS_PER_SHEET);
    }

    // Re-validate against the CURRENT catalog: the client is never trusted
    const [existingCategories, existingProducts] = await Promise.all([
      this.categoryRepository.listByBusiness(business.id),
      this.productRepository.listByBusiness(business.id),
    ]);
    const plan = planCatalogImport(input, existingCategories, existingProducts);

    // All or nothing: the owner confirmed a specific set of rows, so any invalid row cancels the save
    if (plan.issues.length > 0) {
      throw new CatalogImportRejectedError(plan.issues);
    }

    // 1. Categories first (products need their ids)
    const categoryIdByKey = new Map<string, string>();
    const namesToCreate: string[] = [];
    for (const category of plan.categories) {
      if (category.existingId) {
        categoryIdByKey.set(normalizeName(category.name), category.existingId);
      } else {
        namesToCreate.push(category.name);
      }
    }
    const createdCategories = await this.categoryRepository.createMany(business.id, namesToCreate);
    for (const category of createdCategories) {
      categoryIdByKey.set(normalizeName(category.name), category.id);
    }

    // 2. Products
    const toCreate: NewProductData[] = [];
    const toUpdate: ProductChangeData[] = [];
    for (const product of plan.products) {
      if (product.action === 'unchanged') continue;

      const categoryId = categoryIdByKey.get(normalizeName(product.categoryName));
      if (!categoryId) {
        // Cannot happen: the planner already rejected products with unknown categories
        throw new Error(`Category not resolved: ${product.categoryName}`);
      }

      const data: NewProductData = {
        categoryId,
        name: product.name,
        description: product.description,
        price: product.price,
        available: product.available,
        imageUrl: product.imageUrl,
      };

      if (product.action === 'create') {
        toCreate.push(data);
      } else if (product.existingId) {
        toUpdate.push({ id: product.existingId, ...data });
      }
    }

    // If a product write fails, the categories already created stay (harmless: re-running is safe)
    await this.productRepository.createMany(business.id, toCreate);
    await this.productRepository.updateMany(business.id, toUpdate);

    return {
      categoriesCreated: createdCategories.length,
      productsCreated: toCreate.length,
      productsUpdated: toUpdate.length,
      productsUnchanged: plan.products.filter((product) => product.action === 'unchanged').length,
    };
  }
}
