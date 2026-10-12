import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { GetCatalogUseCase } from '../../../application/use-cases/get-catalog.use-case';
import { GetCatalogCommand } from '../../../application/dto/get-catalog.command';
import { NegocioNoEncontradoError } from '../../../domain/errors/business.errors'; // existing name
import { SupabaseAuthGuard } from '../../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';

@Controller('business/catalog')
@UseGuards(SupabaseAuthGuard)
export class CatalogController {
  constructor(private readonly getCatalogUseCase: GetCatalogUseCase) {}

  @Get()
  async getCatalog(@Req() req: AuthenticatedRequest) {
    try {
      return await this.getCatalogUseCase.execute(new GetCatalogCommand(req.user.id));
    } catch (error) {
      if (error instanceof NegocioNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}