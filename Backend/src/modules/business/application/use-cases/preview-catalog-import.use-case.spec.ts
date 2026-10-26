import { jest } from '@jest/globals';
import {
  MAX_ROWS_PER_SHEET,
  PreviewCatalogImportUseCase,
} from './preview-catalog-import.use-case';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository';
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import type { ProductRepository } from '../../domain/repositories/product.repository';
import type { SpreadsheetParserPort } from '../ports/out/spreadsheet-parser.port';
import { PreviewCatalogImportCommand } from '../dto/preview-catalog-import.command';
import { Negocio } from '../../domain/entities/negocio.entity';
import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors';
import { CatalogTooLargeError } from '../../domain/errors/catalog-import.errors';

describe('PreviewCatalogImportUseCase', () => {
  let useCase: PreviewCatalogImportUseCase;
  let businessRepository: jest.Mocked<NegocioRepository>;
  let categoryRepository: jest.Mocked<CategoryRepository>;
  let productRepository: jest.Mocked<ProductRepository>;
  let parser: jest.Mocked<SpreadsheetParserPort>;

  const file = Buffer.from('fake');
  const business = new Negocio('biz-1', 'user-1', 'My Business', '+573001234567', 'activo', null);

  beforeEach(() => {
    businessRepository = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn<() => Promise<Negocio | null>>().mockResolvedValue(business),
      actualizar: jest.fn(),
    };
    categoryRepository = {
      listByBusiness: jest.fn<(businessId: string) => Promise<Category[]>>().mockResolvedValue([]),
      createMany: jest.fn<(businessId: string, names: string[]) => Promise<Category[]>>(),
    };
    productRepository = {
      listByBusiness: jest.fn<ProductRepository['listByBusiness']>().mockResolvedValue([]),
      findByIds: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    };
    parser = { parseCatalog: jest.fn() };

    useCase = new PreviewCatalogImportUseCase(businessRepository, categoryRepository, productRepository, parser);
  });

  it('throws without parsing the file when the user has no business', async () => {
    businessRepository.buscarPorUsuario.mockResolvedValue(null);

    await expect(useCase.execute(new PreviewCatalogImportCommand('user-1', file))).rejects.toThrow(
      NegocioNoEncontradoError,
    );
    expect(parser.parseCatalog).not.toHaveBeenCalled();
  });

  it('builds the preview with a summary and never writes anything', async () => {
    categoryRepository.listByBusiness.mockResolvedValue([new Category('cat-1', 'biz-1', 'Bebidas')]);
    productRepository.listByBusiness.mockResolvedValue([
      new Product('prod-1', 'biz-1', 'cat-1', 'Gaseosa 400ml', null, 4000, true, null),
    ]);
    parser.parseCatalog.mockResolvedValue({
      categories: [
        { row: 2, name: 'Bebidas' },
        { row: 3, name: 'Postres' },
      ],
      products: [
        { row: 2, name: 'Gaseosa 400ml', category: 'Bebidas', price: 4500, description: null, available: null, imageUrl: null },
        { row: 3, name: 'Brownie', category: 'Postres', price: 9500, description: null, available: 'NO', imageUrl: null },
        { row: 4, name: 'Jugo', category: 'Frutas', price: 5000, description: null, available: null, imageUrl: null },
        { row: 4, name: 'Jugo', category: 'Frutas', price: 'x', description: null, available: null, imageUrl: null },
      ],
    });

    const preview = await useCase.execute(new PreviewCatalogImportCommand('user-1', file));

    expect(categoryRepository.listByBusiness).toHaveBeenCalledWith('biz-1');
    expect(preview.summary).toEqual({
      categoriesToCreate: 1,
      productsToCreate: 1,
      productsToUpdate: 1,
      productsUnchanged: 0,
      rejectedRows: 1, // row 4 has several problems but counts once
    });
    expect(preview.issues.length).toBeGreaterThan(1);
    // internal ids are not exposed
    expect(preview.products[0]).not.toHaveProperty('existingId');
    expect(preview.products[0]).toMatchObject({ name: 'Gaseosa 400ml', action: 'update', previousPrice: 4000 });
  });

  it('rejects files with too many rows', async () => {
    parser.parseCatalog.mockResolvedValue({
      categories: [],
      products: Array.from({ length: MAX_ROWS_PER_SHEET + 1 }, (_, index) => ({
        row: index + 2,
        name: `P${index}`,
        category: 'X',
        price: 1,
        description: null,
        available: null,
        imageUrl: null,
      })),
    });

    await expect(useCase.execute(new PreviewCatalogImportCommand('user-1', file))).rejects.toThrow(
      CatalogTooLargeError,
    );
    expect(categoryRepository.listByBusiness).not.toHaveBeenCalled();
  });
});
