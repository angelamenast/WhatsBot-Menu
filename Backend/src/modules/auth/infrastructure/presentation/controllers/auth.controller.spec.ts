import { jest } from '@jest/globals';
import { AuthController } from './auth.controller';
import { RegisterUserUseCase } from '../../../application/use-cases/register-user.use-case';
import { LoginUseCase } from '../../../application/use-cases/login-user.use-case';
import { RefreshSessionUseCase } from '../../../application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { RequestPasswordResetUseCase } from '../../../application/use-cases/request-password-reset.use-case';
import { RegisterRequestDto } from '../dto/register-request.dto';
import { LoginRequestDto } from '../dto/login-request.dto';
import { CorreoYaRegistradoError } from '../../../domain/errors/auth.errors';
import { ConflictException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let registerUserUseCase: jest.Mocked<RegisterUserUseCase>;
  let loginUseCase: jest.Mocked<LoginUseCase>;

  beforeEach(() => {
    registerUserUseCase = { execute: jest.fn() } as any;
    loginUseCase = { execute: jest.fn() } as any;

    controller = new AuthController(
      registerUserUseCase,
      loginUseCase,
      {} as RefreshSessionUseCase,
      {} as LogoutUseCase,
      {} as RequestPasswordResetUseCase,
    );
  });

  it('registra un usuario correctamente', async () => {
    registerUserUseCase.execute.mockResolvedValue({ id: '1', email: 'a@a.com', nombre: 'A' });

    const dto: RegisterRequestDto = { email: 'a@a.com', password: '12345678', nombre: 'A' };
    const result = await controller.register(dto);

    expect(result).toEqual({ id: '1', email: 'a@a.com', nombre: 'A' });
  });

  it('traduce CorreoYaRegistradoError a ConflictException', async () => {
    registerUserUseCase.execute.mockRejectedValue(new CorreoYaRegistradoError());

    const dto: RegisterRequestDto = { email: 'a@a.com', password: '12345678', nombre: 'A' };

    await expect(controller.register(dto)).rejects.toThrow(ConflictException);
  });

  it('inicia sesión y retorna los tokens de Supabase', async () => {
    const session = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 };
    loginUseCase.execute.mockResolvedValue(session);

    const dto: LoginRequestDto = { email: 'a@a.com', password: '12345678' };
    const result = await controller.login(dto);

    expect(result).toEqual(session);
    expect(loginUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      email: dto.email,
      password: dto.password,
    }));
  });
});