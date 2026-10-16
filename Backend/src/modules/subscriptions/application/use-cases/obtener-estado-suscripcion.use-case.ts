import { Inject, Injectable } from '@nestjs/common';
import type { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import { SUSCRIPCION_CONSULTA_REPOSITORY } from '../../domain/repositories/suscripcion-consulta.repository';
import type { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../../business/domain/repositories/negocio.repository';
import {
  calcularDiasRestantes,
  calcularEstadoAcceso,
  puedeEditar,
  puedeUsarAgente,
} from '../../domain/estado-acceso';
import type { EstadoAcceso } from '../../domain/estado-acceso';
import { MENSAJE_ALERTA_VENCIDO, mensajeAlertaPorVencer } from '../../domain/alertas-vencimiento';
import type { TipoAlerta } from '../../domain/alertas-vencimiento';
import { ObtenerEstadoSuscripcionCommand } from '../dto/obtener-estado-suscripcion.command';

// Datos del plan que se exponen al frontend (contrato de GET /api/subscriptions/status).
export interface PlanResumen {
  id: string;
  nombre: string;
  precio: number;
}

export interface AlertaSuscripcion {
  tipo: TipoAlerta;
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
    @Inject(NEGOCIO_REPOSITORY)
    private readonly negocioRepository: NegocioRepository,
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

    const vigente = await this.suscripcionConsultaRepository.buscarVigentePorNegocio(negocioId);
    const estado = calcularEstadoAcceso(vigente?.suscripcion ?? null, ahora);

    return this.construirResultado(estado, negocioId, vigente, ahora);
  }

  private async resolverNegocio(usuarioId: string | null): Promise<string | null> {
    if (!usuarioId) {
      return null;
    }

    const negocio = await this.negocioRepository.buscarPorUsuario(usuarioId);
    return negocio?.id ?? null;
  }

  private construirResultado(
    estado: EstadoAcceso,
    negocioId: string | null,
    vigente: SuscripcionVigente | null,
    ahora: Date,
  ): EstadoSuscripcionResult {
    const fechaFin = vigente?.suscripcion.fechaFin ?? null;
    const diasRestantes = calcularDiasRestantes(fechaFin, ahora);
    const plan = vigente?.plan;

    return {
      estado,
      negocioId,
      suscripcionId: vigente?.suscripcion.id ?? null,
      plan: plan ? { id: plan.id, nombre: plan.nombre, precio: plan.precio } : null,
      fechaFin,
      diasRestantes,
      puedeEditar: puedeEditar(estado),
      puedeUsarAgente: puedeUsarAgente(estado),
      alerta: this.construirAlerta(estado, diasRestantes),
    };
  }

  private construirAlerta(estado: EstadoAcceso, diasRestantes: number | null): AlertaSuscripcion | null {
    if (estado === 'POR_VENCER' && diasRestantes !== null) {
      return { tipo: 'POR_VENCER', mensaje: mensajeAlertaPorVencer(diasRestantes) };
    }

    if (estado === 'VENCIDO') {
      return { tipo: 'VENCIDO', mensaje: MENSAJE_ALERTA_VENCIDO };
    }

    return null;
  }
}
