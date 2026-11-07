import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository'; // existing name
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository'; // existing name
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import { CATEGORY_REPOSITORY } from '../../domain/repositories/category.repository';
import type { ProductRepository } from '../../domain/repositories/product.repository';
import { PRODUCT_REPOSITORY } from '../../domain/repositories/product.repository';
import type { SpreadsheetParserPort } from '../ports/out/spreadsheet-parser.port';
import { SPREADSHEET_PARSER } from '../ports/out/spreadsheet-parser.port';
import { PreviewCatalogImportCommand } from '../dto/preview-catalog-import.command';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors'; // existing name
import { CatalogTooLargeError } from '../../domain/errors/catalog-import.errors';
import { planCatalogImport } from '../../domain/services/plan-catalog-import';
import type {
  CatalogImportIssue,
  CatalogImportPlan,
  ProductField,
} from '../../domain/services/plan-catalog-import';

export const MAX_ROWS_PER_SHEET = 500;

export interface CatalogImportPreview {
  categories: { name: string; action: 'create' | 'existing' }[];
  products: {
    row: number;
    name: string;
    categoryName: string;
    price: number;
    description: string | null;
    available: boolean;
    imageUrl: string | null;
    action: 'create' | 'update' | 'unchanged';
    previousPrice: number | null;
    changedFields: ProductField[];
    needsPriceReview: boolean;
  }[];
  issues: CatalogImportIssue[];
  summary: {
    categoriesToCreate: number;
    productsToCreate: number;
    productsToUpdate: number;
    productsUnchanged: number;
    rejectedRows: number;
  };
}

function toPreview(plan: CatalogImportPlan): CatalogImportPreview {
  const rejectedRows = new Set(plan.issues.map((issue) => `${issue.sheet}:${issue.row}`)).size;

  return {
    // Internal ids are left out on purpose: the confirm step resolves everything by name
    categories: plan.categories.map(({ name, action }) => ({ name, action })),
    products: plan.products.map(({ existingId: _existingId, ...product }) => product),
    issues: plan.issues,
    summary: {
      categoriesToCreate: plan.categories.filter((c) => c.action === 'create').length,
      productsToCreate: plan.products.filter((p) => p.action === 'create').length,
      productsToUpdate: plan.products.filter((p) => p.action === 'update').length,
      productsUnchanged: plan.products.filter((p) => p.action === 'unchanged').length,
      rejectedRows,
    },
  };
}

@Injectable()
export class PreviewCatalogImportUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY) private readonly businessRepository: NegocioRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: CategoryRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository,
    @Inject(SPREADSHEET_PARSER) private readonly spreadsheetParser: SpreadsheetParserPort,
  ) {}

  // Reads and validates the file and compares it with the current catalog.
  // It NEVER persists anything: the owner must review the result first.
  async execute(command: PreviewCatalogImportCommand): Promise<CatalogImportPreview> {
    const business = await this.businessRepository.buscarPorUsuario(command.userId);
    if (!business) {
      throw new NegocioNoEncontradoError();
    }

    const input = await this.spreadsheetParser.parseCatalog(command.file);
    if (input.categories.length > MAX_ROWS_PER_SHEET || input.products.length > MAX_ROWS_PER_SHEET) {
      throw new CatalogTooLargeError(MAX_ROWS_PER_SHEET);
    }

    const [existingCategories, existingProducts] = await Promise.all([
      this.categoryRepository.listByBusiness(business.id),
      this.productRepository.listByBusiness(business.id),
    ]);

    return toPreview(planCatalogImport(input, existingCategories, existingProducts));
  }
}
