import { Inject, Injectable } from '@nestjs/common';
import type { AuthRepository } from '../../domain/repositories/auth.repository';
import { AUTH_REPOSITORY } from '../../domain/repositories/auth.repository';
import { LoginCommand } from '../dto/login.command.dto';
import type { SesionAuth } from '../../domain/repositories/auth.repository';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: LoginCommand): Promise<SesionAuth> {
    // La traducción de errores (credenciales inválidas) ya la hace
    // el repositorio lanzando CredencialesInvalidasError -- este use-case
    // no necesita saber nada de HTTP, solo delega y retorna la sesión.
    return this.authRepository.login(command.email, command.password);
  }
}