import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';
import { ObtenerEstadoSuscripcionUseCase } from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import type {
  AlertaSuscripcion,
  EstadoSuscripcionResult,
} from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import { ObtenerEstadoSuscripcionCommand } from '../../../application/dto/obtener-estado-suscripcion.command';
import type { PlanResumen } from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import type { EstadoAcceso } from '../../../domain/estado-acceso';

export interface EstadoSuscripcionResponse {
  estado: EstadoAcceso;
  suscripcionId: string | null;
  plan: PlanResumen | null;
  fechaFin: string | null;
  diasRestantes: number | null;
  puedeEditar: boolean;
  alerta: AlertaSuscripcion | null;
}

function toResponse(resultado: EstadoSuscripcionResult): EstadoSuscripcionResponse {
  return {
    estado: resultado.estado,
    suscripcionId: resultado.suscripcionId,
    plan: resultado.plan,
    fechaFin: resultado.fechaFin?.toISOString() ?? null,
    diasRestantes: resultado.diasRestantes,
    puedeEditar: resultado.puedeEditar,
    alerta: resultado.alerta,
  };
}

// Sin PlanActivoGuard a propósito: el estado debe poder consultarse aun con el plan vencido.
@Controller('subscriptions')
@UseGuards(SupabaseAuthGuard)
export class SubscriptionsController {
  constructor(private readonly obtenerEstadoSuscripcionUseCase: ObtenerEstadoSuscripcionUseCase) {}

  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest): Promise<EstadoSuscripcionResponse> {
    const resultado = await this.obtenerEstadoSuscripcionUseCase.execute(
      ObtenerEstadoSuscripcionCommand.porUsuario(req.user.id),
    );

    return toResponse(resultado);
  }
}
