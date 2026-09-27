import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CreateNegocioUseCase } from '../../../application/use-cases/create-negocio.use-case';
import { GetNegocioByUsuarioUseCase } from '../../../application/use-cases/get-negocio-by-usuario.use-case';
import { CreateNegocioCommand } from '../../../application/dto/create-negocio.command';
import { GetNegocioByUsuarioCommand } from '../../../application/dto/get-negocio-by-usuario.command';
import { CreateNegocioRequestDto } from '../dto/create-negocio-request.dto';
import { SupabaseAuthGuard } from '../../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { NegocioYaExisteError } from '../../../domain/errors/business.errors';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';

@Controller('business')
@UseGuards(SupabaseAuthGuard)
export class BusinessController {
  constructor(
    private readonly createNegocioUseCase: CreateNegocioUseCase,
    private readonly getNegocioByUsuarioUseCase: GetNegocioByUsuarioUseCase,
  ) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateNegocioRequestDto) {
    try {
      const command = new CreateNegocioCommand(req.user.id,
        dto.nombre_negocio,
        dto.numero_whatsapp,
        dto.descripcion,
      );
      return await this.createNegocioUseCase.execute(command);
    } catch (error) {
      if (error instanceof NegocioYaExisteError) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }

  @Get('mine')
  getMine(@Req() req: AuthenticatedRequest) {
    const command = new GetNegocioByUsuarioCommand(req.user.id);
    return this.getNegocioByUsuarioUseCase.execute(command);
  }
}