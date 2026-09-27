import { Module } from '@nestjs/common';
import { BusinessController } from './infrastructure/presentation/controllers/businness.controller';
import { AuthModule } from '../auth/auth.module';
import { CreateNegocioUseCase } from './application/use-cases/create-negocio.use-case';
import { GetNegocioByUsuarioUseCase } from './application/use-cases/get-negocio-by-usuario.use-case';
import { NEGOCIO_REPOSITORY } from './domain/repositories/negocio.repository';
import { SupabaseNegocioRepository } from './infrastructure/persistence/supabase-negocio.repository';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController],
  providers: [
    CreateNegocioUseCase,
    GetNegocioByUsuarioUseCase,
    SupabaseNegocioRepository,
    { provide: NEGOCIO_REPOSITORY, useExisting: SupabaseNegocioRepository },
  ],
})
export class BusinessModule {}