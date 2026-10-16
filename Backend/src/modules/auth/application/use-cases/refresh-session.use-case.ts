import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../domain/repositories/auth.repository';
import type { AuthRepository, SesionAuth } from '../../domain/repositories/auth.repository';
import { RefreshSessionCommand } from '../dto/refresh.command.dto';

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<SesionAuth> {
    // El repositorio lanza SesionExpiradaError si el refresh token
    // ya no es válido -- este use-case solo delega.
    return this.authRepository.refresh(command.refreshToken);
  }
}