import { Inject, Injectable } from '@nestjs/common';
import type { AuthRepository } from '../../domain/repositories/auth.repository';
import { AUTH_REPOSITORY } from '../../domain/repositories/auth.repository';
import { RequestPasswordResetCommand } from '../dto/request-password-reset.command';

export interface RequestPasswordResetResult {
  message: string;
}

@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<RequestPasswordResetResult> {
    await this.authRepository.solicitarRecuperacion(command.email);

    // Nunca confirmamos ni negamos si el correo existe (previene enumeration attack) —
    // misma decisión que ya teníamos en la versión plana.
    return { message: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña' };
  }
}