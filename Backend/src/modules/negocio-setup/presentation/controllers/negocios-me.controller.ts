import { Body, ConflictException, Controller, Get, NotFoundException, Patch, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { NegocioNoEncontradoError } from '../../../business/domain/errors/business.errors';
import type { AuthenticatedRequest } from '../../../../shared/types/authenticated-request';
import { ObtenerChecklistNegocioUseCase } from '../../application/use-cases/obtener-checklist-negocio.use-case';
import { CambiarAtencionAutomaticaUseCase } from '../../application/use-cases/cambiar-atencion-automatica.use-case';
import { ObtenerChecklistNegocioCommand } from '../../application/dto/obtener-checklist-negocio.command';
import { CambiarAtencionAutomaticaCommand } from '../../application/dto/cambiar-atencion-automatica.command';
import { ChecklistIncompletoError } from '../../domain/errors/negocio-setup.errors';
import { CambiarAtencionAutomaticaRequestDto } from '../dto/cambiar-atencion-automatica-request.dto';

// Sin PlanActivoGuard: un negocio sin plan debe ver su checklist y poder apagar la atención.
// Activar ya exige plan activo dentro del checklist.
@Controller('negocios/me')
@UseGuards(SupabaseAuthGuard)
export class NegociosMeController {
  constructor(
    private readonly obtenerChecklistNegocioUseCase: ObtenerChecklistNegocioUseCase,
    private readonly cambiarAtencionAutomaticaUseCase: CambiarAtencionAutomaticaUseCase,
  ) {}

  @Get('checklist')
  async checklist(@Req() req: AuthenticatedRequest) {
    try {
      return await this.obtenerChecklistNegocioUseCase.execute(new ObtenerChecklistNegocioCommand(req.user.id));
    } catch (error) {
      if (error instanceof NegocioNoEncontradoError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('atencion-automatica')
  async cambiarAtencionAutomatica(@Req() req: AuthenticatedRequest, @Body() dto: CambiarAtencionAutomaticaRequestDto) {
    try {
      return await this.cambiarAtencionAutomaticaUseCase.execute(new CambiarAtencionAutomaticaCommand(req.user.id, dto.activa));
    } catch (error) {
      if (error instanceof NegocioNoEncontradoError) throw new NotFoundException(error.message);
      if (error instanceof ChecklistIncompletoError) {
        throw new ConflictException({ statusCode: 409, error: 'Conflict', message: error.message, faltantes: error.faltantes });
      }
      throw error;
    }
  }
}
