import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../domain/repositories/auth.repository';
import type { AuthRepository } from '../../domain/repositories/auth.repository';
import { LogoutCommand } from '../dto/logout.command.dto';

export interface LogoutResult {
  message: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: LogoutCommand): Promise<LogoutResult> {
    await this.authRepository.logout(command.accessToken);
    return { message: 'Sesión cerrada correctamente' };
  }
}