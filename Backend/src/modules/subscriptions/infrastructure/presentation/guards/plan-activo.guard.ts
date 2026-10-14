import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';
import { ObtenerEstadoSuscripcionUseCase } from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import { ObtenerEstadoSuscripcionCommand } from '../../../application/dto/obtener-estado-suscripcion.command';
import { PlanVencidoError } from '../../../domain/errors/subscriptions.errors';

const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

// HU-8.5 criterio 2: con el plan vencido el dashboard queda en solo lectura.
// Uso: @UseGuards(SupabaseAuthGuard, PlanActivoGuard), siempre después del guard de auth.
// No sirve como APP_GUARD global: los guards globales corren antes que req.user exista.
@Injectable()
export class PlanActivoGuard implements CanActivate {
  constructor(private readonly obtenerEstadoSuscripcionUseCase: ObtenerEstadoSuscripcionUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      // Solo ocurre si el guard quedó antes de SupabaseAuthGuard.
      throw new UnauthorizedException('Token no proporcionado');
    }

    if (METODOS_LECTURA.has(request.method)) {
      return true;
    }

    const resultado = await this.obtenerEstadoSuscripcionUseCase.execute(
      ObtenerEstadoSuscripcionCommand.porUsuario(request.user.id),
    );

    if (resultado.puedeEditar) {
      return true;
    }

    const error = new PlanVencidoError();
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message: error.message,
      codigo: error.codigo,
    });
  }
}
