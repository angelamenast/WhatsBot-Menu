import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../../business/domain/repositories/negocio.repository';
import { NegocioNoEncontradoError } from '../../../business/domain/errors/business.errors';
import { ChecklistIncompletoError } from '../../domain/errors/negocio-setup.errors';
import { CambiarAtencionAutomaticaCommand } from '../dto/cambiar-atencion-automatica.command';
import { ObtenerChecklistNegocioUseCase } from './obtener-checklist-negocio.use-case';

export interface CambiarAtencionAutomaticaResult {
  atencionAutomaticaActiva: boolean;
}

// TREMIA-71. Desactivar siempre se permite; activar exige el checklist completo (TREMIA-104).
@Injectable()
export class CambiarAtencionAutomaticaUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY) private readonly negocioRepository: NegocioRepository,
    private readonly obtenerChecklistNegocioUseCase: ObtenerChecklistNegocioUseCase,
  ) {}

  async execute(command: CambiarAtencionAutomaticaCommand): Promise<CambiarAtencionAutomaticaResult> {
    const negocio = await this.negocioRepository.buscarPorUsuario(command.usuarioId);
    if (!negocio) {
      throw new NegocioNoEncontradoError();
    }

    if (command.activa) {
      const checklist = await this.obtenerChecklistNegocioUseCase.evaluar(negocio.id);
      if (!checklist.completo) {
        throw new ChecklistIncompletoError(
          checklist.items.filter(item => !item.completo).map(({ clave, label }) => ({ clave, label })),
        );
      }
    }

    const atencionAutomaticaActiva = await this.negocioRepository.actualizarAtencionAutomatica(negocio.id, command.activa);
    return { atencionAutomaticaActiva };
  }
}
