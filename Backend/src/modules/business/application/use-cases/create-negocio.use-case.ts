import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository';
import { CreateNegocioCommand } from '../dto/create-negocio.command';
import { Negocio } from '../../domain/entities/negocio.entity';
import { NegocioYaExisteError } from '../../domain/errors/business.errors';

@Injectable()
export class CreateNegocioUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY)
    private readonly negocioRepository: NegocioRepository,
  ) {}

  async execute(command: CreateNegocioCommand): Promise<Negocio> {
    // MVP trata la relación usuario:negocio como 1:1
    const yaExiste = await this.negocioRepository.existeNegocioActivoPorUsuario(command.usuarioId);

    if (yaExiste) {
      throw new NegocioYaExisteError();
    }

    return this.negocioRepository.crear({
      usuarioId: command.usuarioId,
      nombreNegocio: command.nombreNegocio,
      numeroWhatsapp: command.numeroWhatsapp,
      descripcion: command.descripcion ?? null,
    });
  }
}