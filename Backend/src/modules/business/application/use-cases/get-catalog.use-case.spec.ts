import { jest } from '@jest/globals';
import { GetCatalogUseCase } from './get-catalog.use-case';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository'; // existing name
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import type { ProductRepository } from '../../domain/repositories/product.repository';
import { GetCatalogCommand } from '../dto/get-catalog.command';
import { Negocio } from '../../domain/entities/negocio.entity'; // existing name
import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors'; // existing name

describe('GetCatalogUseCase', () => {
  let useCase: GetCatalogUseCase;
  let businessRepository: jest.Mocked<NegocioRepository>;
  let categoryRepository: jest.Mocked<CategoryRepository>;
  let productRepository: jest.Mocked<ProductRepository>;

  beforeEach(() => {
    businessRepository = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn(),
      actualizar: jest.fn(),
    };
    categoryRepository = { listByBusiness: jest.fn(), createMany: jest.fn() };
    productRepository = {
      listByBusiness: jest.fn(),
      findByIds: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    };

    useCase = new GetCatalogUseCase(businessRepository, categoryRepository, productRepository);
  });

  it("returns the categories and products of the user's business", async () => {
    const business = new Negocio('biz-1', 'user-1', 'My Business', '+573001234567', 'activo', null);
    const categories = [new Category('cat-1', 'biz-1', 'Bebidas')];
    const products = [new Product('prod-1', 'biz-1', 'cat-1', 'Gaseosa 400ml', null, 4000, true, null)];

    businessRepository.buscarPorUsuario.mockResolvedValue(business);
    categoryRepository.listByBusiness.mockResolvedValue(categories);
    productRepository.listByBusiness.mockResolvedValue(products);

    const result = await useCase.execute(new GetCatalogCommand('user-1'));

    expect(result).toEqual({ categories, products });
    expect(categoryRepository.listByBusiness).toHaveBeenCalledWith('biz-1');
  });

  it('throws when the user has no business', async () => {
    businessRepository.buscarPorUsuario.mockResolvedValue(null);

    await expect(useCase.execute(new GetCatalogCommand('user-1'))).rejects.toThrow(
      NegocioNoEncontradoError,
    );
    expect(categoryRepository.listByBusiness).not.toHaveBeenCalled();
  });
});