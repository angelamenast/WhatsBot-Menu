import { Module } from '@nestjs/common';
import { BusinessController } from './infrastructure/presentation/controllers/business.controller';
import { AuthModule } from '../auth/auth.module';
import { CreateNegocioUseCase } from './application/use-cases/create-negocio.use-case';
import { GetNegocioByUsuarioUseCase } from './application/use-cases/get-negocio-by-usuario.use-case';
import { UpdateNegocioUseCase } from './application/use-cases/update-negocio.use-case';
import { NEGOCIO_REPOSITORY } from './domain/repositories/negocio.repository';
import { SupabaseNegocioRepository } from './infrastructure/persistence/supabase-negocio.repository';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController],
  providers: [
    CreateNegocioUseCase,
    GetNegocioByUsuarioUseCase,
    UpdateNegocioUseCase,
    SupabaseNegocioRepository,
    { provide: NEGOCIO_REPOSITORY, useExisting: SupabaseNegocioRepository },
  ],
  exports: [NEGOCIO_REPOSITORY],
})
export class BusinessModule {}