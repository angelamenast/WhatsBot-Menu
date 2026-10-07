import { jest } from '@jest/globals';
import { LoginUseCase } from './login-user.use-case';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { LoginCommand } from '../dto/login.command.dto';
import { CredencialesInvalidasError } from '../../domain/errors/auth.errors';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
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
    useCase = new LoginUseCase(authRepository);
  });

  it('retorna la sesión cuando las credenciales son correctas', async () => {
    const sesionEsperada = { accessToken: 'abc', refreshToken: 'def', expiresIn: 3600 };
    authRepository.login.mockResolvedValue(sesionEsperada);

    const command = new LoginCommand('test@test.com', '12345678');
    const result = await useCase.execute(command);

    expect(result).toEqual(sesionEsperada);
    expect(authRepository.login).toHaveBeenCalledWith('test@test.com', '12345678');
  });

  it('propaga el error cuando las credenciales son inválidas', async () => {
    authRepository.login.mockRejectedValue(new CredencialesInvalidasError());

    const command = new LoginCommand('test@test.com', 'wrongpass');

    await expect(useCase.execute(command)).rejects.toThrow(CredencialesInvalidasError);
  });
});