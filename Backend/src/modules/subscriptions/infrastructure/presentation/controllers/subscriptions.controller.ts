import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthGuard } from '../../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';
import { ObtenerEstadoSuscripcionUseCase } from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import type {
  AlertaSuscripcion,
  EstadoSuscripcionResult,
  PlanResumen,
} from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import { IniciarRenovacionUseCase } from '../../../application/use-cases/iniciar-renovacion.use-case';
import type { IniciarRenovacionResult } from '../../../application/use-cases/iniciar-renovacion.use-case';
import { ConsultarRenovacionUseCase } from '../../../application/use-cases/consultar-renovacion.use-case';
import type { EstadoRenovacion } from '../../../application/use-cases/consultar-renovacion.use-case';
import { ObtenerEstadoSuscripcionCommand } from '../../../application/dto/obtener-estado-suscripcion.command';
import { IniciarRenovacionCommand } from '../../../application/dto/iniciar-renovacion.command';
import { ConsultarRenovacionCommand } from '../../../application/dto/consultar-renovacion.command';
import type { EstadoAcceso } from '../../../domain/estado-acceso';
import {
  PlanVigenteConfirmarError,
  RenovacionNoEncontradaError,
  SinSuscripcionError,
} from '../../../domain/errors/subscriptions.errors';
import { IniciarRenovacionRequestDto } from '../dto/iniciar-renovacion-request.dto';

export interface EstadoSuscripcionResponse {
  estado: EstadoAcceso;
  suscripcionId: string | null;
  plan: PlanResumen | null;
  fechaFin: string | null;
  diasRestantes: number | null;
  puedeEditar: boolean;
  alerta: AlertaSuscripcion | null;
}

export interface ConsultarRenovacionResponse {
  referencia: string;
  estado: EstadoRenovacion;
  fechaFin: string | null;
  mensaje: string;
}

// Mismo placeholder que usa HU-8.1 mientras no se defina la página de retorno del frontend.
const REDIRECT_URL_POR_DEFECTO = 'https://tu-frontend.com/pago-confirmado';

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

// Sin PlanActivoGuard a propósito: con el plan vencido se debe poder consultar el estado y renovar.
@Controller('subscriptions')
@UseGuards(SupabaseAuthGuard)
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(
    private readonly obtenerEstadoSuscripcionUseCase: ObtenerEstadoSuscripcionUseCase,
    private readonly iniciarRenovacionUseCase: IniciarRenovacionUseCase,
    private readonly consultarRenovacionUseCase: ConsultarRenovacionUseCase,
    private readonly configService: ConfigService,
  ) {}

  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest): Promise<EstadoSuscripcionResponse> {
    const resultado = await this.obtenerEstadoSuscripcionUseCase.execute(
      ObtenerEstadoSuscripcionCommand.porUsuario(req.user.id),
    );

    return toResponse(resultado);
  }

  @Post('renewal')
  async iniciarRenovacion(
    @Req() req: AuthenticatedRequest,
    @Body() dto: IniciarRenovacionRequestDto,
  ): Promise<IniciarRenovacionResult> {
    try {
      const command = new IniciarRenovacionCommand(
        req.user.id,
        dto.confirmarRenovacionAnticipada ?? false,
        this.configService.get<string>('WOMPI_REDIRECT_URL') ?? REDIRECT_URL_POR_DEFECTO,
      );
      return await this.iniciarRenovacionUseCase.execute(command);
    } catch (error) {
      if (error instanceof SinSuscripcionError) {
        throw new NotFoundException({ statusCode: 404, error: 'Not Found', message: error.message, codigo: error.codigo });
      }
      if (error instanceof PlanVigenteConfirmarError) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: error.message,
          codigo: error.codigo,
          fechaFin: error.fechaFin.toISOString(),
        });
      }
      // Fallo de Wompi o de la BD: no se exponen detalles internos al cliente.
      this.logger.error(`No se pudo iniciar la renovación: ${(error as Error).message}`);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No pudimos iniciar la renovación. Intenta nuevamente.',
        codigo: 'RENOVACION_FALLIDA',
      });
    }
  }

  @Get('renewal/:referencia')
  async consultarRenovacion(
    @Req() req: AuthenticatedRequest,
    @Param('referencia') referencia: string,
  ): Promise<ConsultarRenovacionResponse> {
    try {
      const resultado = await this.consultarRenovacionUseCase.execute(
        new ConsultarRenovacionCommand(req.user.id, referencia),
      );
      return { ...resultado, fechaFin: resultado.fechaFin?.toISOString() ?? null };
    } catch (error) {
      if (error instanceof RenovacionNoEncontradaError) {
        throw new NotFoundException({ statusCode: 404, error: 'Not Found', message: error.message, codigo: error.codigo });
      }
      throw error;
    }
  }
}
