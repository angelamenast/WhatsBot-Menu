import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository';
import { GetNegocioByUsuarioCommand } from '../dto/get-negocio-by-usuario.command';
import { Negocio } from '../../domain/entities/negocio.entity';

@Injectable()
export class GetNegocioByUsuarioUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY)
    private readonly negocioRepository: NegocioRepository,
  ) {}

  async execute(command: GetNegocioByUsuarioCommand): Promise<Negocio | null> {
    // Retorna null a propósito (no lanza error) -- el frontend usa esto
    // para decidir si mostrar onboarding, no es un caso de error real.
    return this.negocioRepository.buscarPorUsuario(command.usuarioId);
  }
}