import { Body, Controller, ForbiddenException, NotFoundException, Get, Post, Patch, Req, UseGuards } from '@nestjs/common';
import { CreateNegocioUseCase } from '../../../application/use-cases/create-negocio.use-case';
import { GetNegocioByUsuarioUseCase } from '../../../application/use-cases/get-negocio-by-usuario.use-case';
import { UpdateNegocioUseCase } from '../../../application/use-cases/update-negocio.use-case';
import { CreateNegocioCommand } from '../../../application/dto/create-negocio.command';
import { GetNegocioByUsuarioCommand } from '../../../application/dto/get-negocio-by-usuario.command';
import { UpdateNegocioCommand } from '../../../application/dto/update-negocio.command';
import { CreateNegocioRequestDto } from '../dto/create-negocio-request.dto';
import { UpdateNegocioRequestDto } from '../dto/update-negocio-request.dto';
import { SupabaseAuthGuard } from '../../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { NegocioYaExisteError, NegocioNoEncontradoError } from '../../../domain/errors/business.errors';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';

@Controller('business')
@UseGuards(SupabaseAuthGuard)
export class BusinessController {
  constructor(
    private readonly createNegocioUseCase: CreateNegocioUseCase,
    private readonly getNegocioByUsuarioUseCase: GetNegocioByUsuarioUseCase,
    private readonly updateNegocioUseCase: UpdateNegocioUseCase,
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

  @Patch('mine')
  async updateMine(@Req() req: AuthenticatedRequest, @Body() dto: UpdateNegocioRequestDto) {
    try {
      const command = new UpdateNegocioCommand(
        req.user.id,
        dto.nombre_negocio,
        dto.numero_whatsapp,
        dto.descripcion,
      );
      return await this.updateNegocioUseCase.execute(command);
    } catch (error) {
      if (error instanceof NegocioNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}