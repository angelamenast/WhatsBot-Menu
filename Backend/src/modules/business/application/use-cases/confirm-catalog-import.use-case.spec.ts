import { jest } from '@jest/globals';
import { ConfirmCatalogImportUseCase } from './confirm-catalog-import.use-case';
import { MAX_ROWS_PER_SHEET } from './preview-catalog-import.use-case';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository';
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import type { ProductRepository } from '../../domain/repositories/product.repository';
import { ConfirmCatalogImportCommand } from '../dto/confirm-catalog-import.command';
import { Negocio } from '../../domain/entities/negocio.entity';
import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors';
import { CatalogImportRejectedError, CatalogTooLargeError } from '../../domain/errors/catalog-import.errors';
import type { CatalogImportInput, RawProductRow } from '../../domain/services/plan-catalog-import';

function productRow(row: number, name: string, category: string, price: unknown): RawProductRow {
  return { row, name, category, price, description: null, available: null, imageUrl: null };
}

describe('ConfirmCatalogImportUseCase', () => {
  let useCase: ConfirmCatalogImportUseCase;
  let businessRepository: jest.Mocked<NegocioRepository>;
  let categoryRepository: jest.Mocked<CategoryRepository>;
  let productRepository: jest.Mocked<ProductRepository>;

  const business = new Negocio('biz-1', 'user-1', 'My Business', '+573001234567', 'activo', null);
  const confirm = (input: CatalogImportInput) => useCase.execute(new ConfirmCatalogImportCommand('user-1', input));

  beforeEach(() => {
    businessRepository = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn<NegocioRepository['buscarPorUsuario']>().mockResolvedValue(business),
      actualizar: jest.fn(),
    };
    categoryRepository = {
      listByBusiness: jest.fn<CategoryRepository['listByBusiness']>().mockResolvedValue([]),
      // Echoes the names back as created categories, like the real repository
      createMany: jest
        .fn<CategoryRepository['createMany']>()
        .mockImplementation(async (businessId, names) =>
          names.map((name, index) => new Category(`new-cat-${index + 1}`, businessId, name)),
        ),
    };
    productRepository = {
      listByBusiness: jest.fn<ProductRepository['listByBusiness']>().mockResolvedValue([]),
      findByIds: jest.fn(),
      createMany: jest.fn<ProductRepository['createMany']>().mockResolvedValue(undefined),
      updateMany: jest.fn<ProductRepository['updateMany']>().mockResolvedValue(undefined),
    };

    useCase = new ConfirmCatalogImportUseCase(businessRepository, categoryRepository, productRepository);
  });

  it('throws without reading the catalog when the user has no business', async () => {
    businessRepository.buscarPorUsuario.mockResolvedValue(null);

    await expect(confirm({ categories: [], products: [] })).rejects.toThrow(NegocioNoEncontradoError);
    expect(categoryRepository.listByBusiness).not.toHaveBeenCalled();
  });

  it('rejects too many rows before reading the catalog', async () => {
    const products = Array.from({ length: MAX_ROWS_PER_SHEET + 1 }, (_, index) =>
      productRow(index + 2, `P${index}`, 'X', 1),
    );

    await expect(confirm({ categories: [], products })).rejects.toThrow(CatalogTooLargeError);
    expect(categoryRepository.listByBusiness).not.toHaveBeenCalled();
  });

  it('saves nothing when any row is invalid and returns the issues', async () => {
    const promise = confirm({
      categories: [{ row: 2, name: 'Bebidas' }],
      products: [productRow(2, 'Gaseosa', 'Bebidas', 4000), productRow(3, 'Jugo', 'Frutas', 'x')],
    });

    await expect(promise).rejects.toThrow(CatalogImportRejectedError);
    await promise.catch((error: CatalogImportRejectedError) => {
      expect(error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ sheet: 'Productos', row: 3 })]),
      );
    });
    expect(categoryRepository.createMany).not.toHaveBeenCalled();
    expect(productRepository.createMany).not.toHaveBeenCalled();
    expect(productRepository.updateMany).not.toHaveBeenCalled();
  });

  it('creates new categories first and links new products to their ids', async () => {
    const result = await confirm({
      categories: [{ row: 2, name: 'Postres' }],
      products: [productRow(2, 'Brownie', 'postres ', 9500)],
    });

    expect(categoryRepository.createMany).toHaveBeenCalledWith('biz-1', ['Postres']);
    expect(productRepository.createMany).toHaveBeenCalledWith('biz-1', [
      {
        categoryId: 'new-cat-1',
        name: 'Brownie',
        description: null,
        price: 9500,
        available: true,
        imageUrl: null,
      },
    ]);
    expect(categoryRepository.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      productRepository.createMany.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ categoriesCreated: 1, productsCreated: 1, productsUpdated: 0, productsUnchanged: 0 });
  });

  it('updates changed products using their existing ids and skips unchanged ones', async () => {
    categoryRepository.listByBusiness.mockResolvedValue([new Category('cat-1', 'biz-1', 'Bebidas')]);
    productRepository.listByBusiness.mockResolvedValue([
      new Product('prod-1', 'biz-1', 'cat-1', 'Gaseosa', null, 4000, true, null),
      new Product('prod-2', 'biz-1', 'cat-1', 'Agua', null, 2000, true, null),
    ]);

    const result = await confirm({
      categories: [{ row: 2, name: 'Bebidas' }],
      products: [productRow(2, 'Gaseosa', 'Bebidas', 4500), productRow(3, 'Agua', 'Bebidas', 2000)],
    });

    expect(categoryRepository.createMany).toHaveBeenCalledWith('biz-1', []);
    expect(productRepository.createMany).toHaveBeenCalledWith('biz-1', []);
    expect(productRepository.updateMany).toHaveBeenCalledWith('biz-1', [
      {
        id: 'prod-1',
        categoryId: 'cat-1',
        name: 'Gaseosa',
        description: null,
        price: 4500,
        available: true,
        imageUrl: null,
      },
    ]);
    expect(result).toEqual({ categoriesCreated: 0, productsCreated: 0, productsUpdated: 1, productsUnchanged: 1 });
  });
});
