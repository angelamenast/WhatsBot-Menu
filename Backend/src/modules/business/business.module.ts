import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreateNegocioUseCase } from './application/use-cases/create-negocio.use-case';
import { GetNegocioByUsuarioUseCase } from './application/use-cases/get-negocio-by-usuario.use-case';
import { UpdateNegocioUseCase } from './application/use-cases/update-negocio.use-case';
import { GetCatalogUseCase } from './application/use-cases/get-catalog.use-case';
import { BusinessService } from './business.service';
import { NEGOCIO_REPOSITORY } from './domain/repositories/negocio.repository';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository';
import { SupabaseNegocioRepository } from './infrastructure/persistence/supabase-negocio.repository';
import { SupabaseProductRepository } from './infrastructure/persistence/supabase-product.repository';
import { SupabaseCategoryRepository } from './infrastructure/persistence/supabase-category.repository';
import { BusinessController } from './infrastructure/presentation/controllers/business.controller';
import { CatalogController } from './infrastructure/presentation/controllers/catalog.controller';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController, CatalogController],
  providers: [
    CreateNegocioUseCase,
    GetNegocioByUsuarioUseCase,
    UpdateNegocioUseCase,
    GetCatalogUseCase,
    BusinessService,
    SupabaseNegocioRepository,
    SupabaseCategoryRepository,
    SupabaseProductRepository,
    { provide: NEGOCIO_REPOSITORY, useExisting: SupabaseNegocioRepository },
    { provide: CATEGORY_REPOSITORY, useExisting: SupabaseCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useExisting: SupabaseProductRepository },
  ],
  exports: [NEGOCIO_REPOSITORY, CATEGORY_REPOSITORY, PRODUCT_REPOSITORY, BusinessService],
})
export class BusinessModule {}