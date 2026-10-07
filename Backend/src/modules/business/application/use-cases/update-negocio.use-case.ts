import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository';
import { UpdateNegocioCommand } from '../dto/update-negocio.command';
import { Negocio } from '../../domain/entities/negocio.entity';
import { NegocioNoEncontradoError } from '../../domain/errors/business.errors';

@Injectable()
export class UpdateNegocioUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY)
    private readonly negocioRepository: NegocioRepository,
  ) {}

  async execute(command: UpdateNegocioCommand): Promise<Negocio> {
    const negocio = await this.negocioRepository.buscarPorUsuario(command.usuarioId);

    if (!negocio) {
      throw new NegocioNoEncontradoError();
    }

    return this.negocioRepository.actualizar(command.usuarioId, {
      nombreNegocio: command.nombreNegocio,
      numeroWhatsapp: command.numeroWhatsapp,
      descripcion: command.descripcion,
    });
  }
}
