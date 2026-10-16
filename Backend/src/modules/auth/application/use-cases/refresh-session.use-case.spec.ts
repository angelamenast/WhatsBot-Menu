import { jest } from '@jest/globals';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { RefreshSessionCommand } from '../dto/refresh.command.dto';
import { SesionExpiradaError } from '../../domain/errors/auth.errors';

describe('RefreshSessionUseCase', () => {
  let useCase: RefreshSessionUseCase;
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
    useCase = new RefreshSessionUseCase(authRepository);
  });

  it('retorna una nueva sesión cuando el refresh token es válido', async () => {
    const nuevaSesion = { accessToken: 'nuevo-abc', refreshToken: 'nuevo-def', expiresIn: 3600 };
    authRepository.refresh.mockResolvedValue(nuevaSesion);

    const command = new RefreshSessionCommand('token-viejo-valido');
    const result = await useCase.execute(command);

    expect(result).toEqual(nuevaSesion);
    expect(authRepository.refresh).toHaveBeenCalledWith('token-viejo-valido');
  });

  it('propaga el error cuando el refresh token expiró', async () => {
    authRepository.refresh.mockRejectedValue(new SesionExpiradaError());

    const command = new RefreshSessionCommand('token-expirado');

    await expect(useCase.execute(command)).rejects.toThrow(SesionExpiradaError);
  });
});