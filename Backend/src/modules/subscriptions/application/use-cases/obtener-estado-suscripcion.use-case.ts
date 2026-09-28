import { Inject, Injectable } from '@nestjs/common';
import type { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from '../../domain/repositories/suscripcion-consulta.repository';
import type { PlanResumen } from '../../domain/entities/suscripcion-vigente.entity';
import {
  calcularDiasRestantes,
  calcularEstadoAcceso,
  puedeEditar,
  puedeUsarAgente,
} from '../../domain/estado-acceso';
import type { EstadoAcceso } from '../../domain/estado-acceso';
import { ObtenerEstadoSuscripcionCommand } from '../dto/obtener-estado-suscripcion.command';

export interface AlertaSuscripcion {
  tipo: 'POR_VENCER' | 'VENCIDO';
  mensaje: string;
}

export interface EstadoSuscripcionResult {
  estado: EstadoAcceso;
  negocioId: string | null;
  suscripcionId: string | null;
  plan: PlanResumen | null;
  fechaFin: Date | null;
  diasRestantes: number | null;
  puedeEditar: boolean;
  puedeUsarAgente: boolean;
  alerta: AlertaSuscripcion | null;
}

@Injectable()
export class ObtenerEstadoSuscripcionUseCase {
  constructor(
    @Inject(SUSCRIPCION_CONSULTA_REPOSITORY)
    private readonly suscripcionConsultaRepository: SuscripcionConsultaRepository,
  ) {}

  async execute(
    command: ObtenerEstadoSuscripcionCommand,
    ahora: Date = new Date(),
  ): Promise<EstadoSuscripcionResult> {
    const negocioId = command.negocioId ?? (await this.resolverNegocio(command.usuarioId));

    // Sin negocio aún (onboarding): no es un error, simplemente no hay plan.
    if (!negocioId) {
      return this.construirResultado('SIN_PLAN', null, null, ahora);
    }

    const suscripcion = await this.suscripcionConsultaRepository.buscarVigentePorNegocio(negocioId);
    const estado = calcularEstadoAcceso(suscripcion, ahora);

    return this.construirResultado(estado, negocioId, suscripcion, ahora);
  }

  private async resolverNegocio(usuarioId: string | null): Promise<string | null> {
    if (!usuarioId) {
      return null;
    }

    return this.suscripcionConsultaRepository.buscarNegocioIdPorUsuario(usuarioId);
  }

  private construirResultado(
    estado: EstadoAcceso,
    negocioId: string | null,
    suscripcion: { id: string; plan: PlanResumen | null; fechaFin: Date | null } | null,
    ahora: Date,
  ): EstadoSuscripcionResult {
    const fechaFin = suscripcion?.fechaFin ?? null;
    const diasRestantes = calcularDiasRestantes(fechaFin, ahora);

    return {
      estado,
      negocioId,
      suscripcionId: suscripcion?.id ?? null,
      plan: suscripcion?.plan ?? null,
      fechaFin,
      diasRestantes,
      puedeEditar: puedeEditar(estado),
      puedeUsarAgente: puedeUsarAgente(estado),
      alerta: this.construirAlerta(estado, diasRestantes),
    };
  }

  private construirAlerta(estado: EstadoAcceso, diasRestantes: number | null): AlertaSuscripcion | null {
    if (estado === 'POR_VENCER') {
      const dias = diasRestantes === 1 ? '1 día' : `${diasRestantes} días`;
      return { tipo: 'POR_VENCER', mensaje: `Tu plan vence en ${dias}. Renuévalo aquí.` };
    }

    if (estado === 'VENCIDO') {
      return {
        tipo: 'VENCIDO',
        mensaje: 'Tu plan venció y el servicio está restringido. Renuévalo para reactivarlo.',
      };
    }

    return null;
  }
}
