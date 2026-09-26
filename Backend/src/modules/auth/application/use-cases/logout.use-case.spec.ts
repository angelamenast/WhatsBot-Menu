import { jest } from '@jest/globals';
import { LogoutUseCase } from './logout.use-case';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { LogoutCommand } from '../dto/logout.command.dto';

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;
  let authRepository: jest.Mocked<AuthRepository>;

  beforeEach(() => {
    authRepository = {
      crearUsuarioAuth: jest.fn(),
      crearPerfil: jest.fn(),
      eliminarUsuarioAuth: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      solicitarRecuperacion: jest.fn(),
    };
    useCase = new LogoutUseCase(authRepository);
  });

  it('cierra la sesión y retorna un mensaje de confirmación', async () => {
    authRepository.logout.mockResolvedValue(undefined);

    const command = new LogoutCommand('access-token-valido');
    const result = await useCase.execute(command);

    expect(result).toEqual({ message: 'Sesión cerrada correctamente' });
    expect(authRepository.logout).toHaveBeenCalledWith('access-token-valido');
  });
});