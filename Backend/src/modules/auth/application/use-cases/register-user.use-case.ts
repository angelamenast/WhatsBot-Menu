import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../domain/repositories/auth.repository';
import type { AuthRepository } from '../../domain/repositories/auth.repository';
import { RegisterCommand } from '../dto/register.command.dto';
import { RegistroPerfilFallidoError } from '../../domain/errors/auth.errors';

export interface RegisterResult {
  id: string;
  email: string;
  nombre: string;
}

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: RegisterCommand): Promise<RegisterResult> {
    // Paso 1: crear el usuario en Supabase Auth (email + password)
    const authUser = await this.authRepository.crearUsuarioAuth(
      command.email,
      command.password,
      command.nombre,
    );

    // Paso 2: crear el perfil en la tabla "usuarios"
    try {
      const perfil = await this.authRepository.crearPerfil(
        authUser.id,
        command.nombre,
        command.telefono ?? null,
      );

      return {
        id: perfil.id,
        email: authUser.email,
        nombre: perfil.nombre,
      };
    } catch (error) {
      // Misma lógica que ya teníamos: si falla el perfil, no dejamos
      // un usuario huérfano en Auth sin su fila correspondiente.
      await this.authRepository.eliminarUsuarioAuth(authUser.id);
      throw new RegistroPerfilFallidoError();
    }
  }
}