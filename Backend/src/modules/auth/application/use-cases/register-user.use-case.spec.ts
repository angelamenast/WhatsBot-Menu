import { jest } from '@jest/globals';
import { RegisterUserUseCase } from './register-user.use-case';
import { AuthRepository } from '../../domain/repositories/auth.repository';
import { RegisterCommand } from '../dto/register.command.dto';
import { RegistroPerfilFallidoError } from '../../domain/errors/auth.errors';

describe('RegisterUserUseCase', () => {
  let useCase: RegisterUserUseCase;
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
    useCase = new RegisterUserUseCase(authRepository);
  });

  it('crea el usuario de auth y su perfil correctamente', async () => {
    authRepository.crearUsuarioAuth.mockResolvedValue({ id: '123', email: 'test@test.com' });
    authRepository.crearPerfil.mockResolvedValue({ id: '123', nombre: 'Test', telefono: null });

    const command = new RegisterCommand('test@test.com', '12345678', 'Test');
    const result = await useCase.execute(command);

    expect(result).toEqual({ id: '123', email: 'test@test.com', nombre: 'Test' });
    expect(authRepository.eliminarUsuarioAuth).not.toHaveBeenCalled();
  });

  it('hace rollback del usuario de auth si falla la creación del perfil', async () => {
    authRepository.crearUsuarioAuth.mockResolvedValue({ id: '123', email: 'test@test.com' });
    authRepository.crearPerfil.mockRejectedValue(new Error('fallo en la BD'));

    const command = new RegisterCommand('test@test.com', '12345678', 'Test');

    await expect(useCase.execute(command)).rejects.toThrow(RegistroPerfilFallidoError);
    expect(authRepository.eliminarUsuarioAuth).toHaveBeenCalledWith('123');
  });
});