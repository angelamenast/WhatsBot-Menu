import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository'; // existing name
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository'; // existing name
import type { CategoryRepository } from '../../domain/repositories/category.repository';
import { CATEGORY_REPOSITORY } from '../../domain/repositories/category.repository';
import type { ProductRepository } from '../../domain/repositories/product.repository';
import { PRODUCT_REPOSITORY } from '../../domain/repositories/product.repository';
import { GetCatalogCommand } from '../dto/get-catalog.command';
import { Category } from '../../domain/entities/category.entity';
import { Product } from '../../domain/entities/product.entity';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors'; // existing name

export interface CatalogResult {
  categories: Category[];
  products: Product[];
}

@Injectable()
export class GetCatalogUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY) private readonly businessRepository: NegocioRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: CategoryRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository,
  ) {}

  async execute(command: GetCatalogCommand): Promise<CatalogResult> {
    // The business is resolved from the authenticated user, never from the request body
    const business = await this.businessRepository.buscarPorUsuario(command.userId);

    if (!business) {
      throw new NegocioNoEncontradoError();
    }

    const [categories, products] = await Promise.all([
      this.categoryRepository.listByBusiness(business.id),
      this.productRepository.listByBusiness(business.id),
    ]);

    return { categories, products };
  }
}