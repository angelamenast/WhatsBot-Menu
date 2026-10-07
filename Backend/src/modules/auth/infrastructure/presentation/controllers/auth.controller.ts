import {
  Body,
  Controller,
  Post,
  UseGuards,
  Headers,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterUserUseCase } from '../../../application/use-cases/register-user.use-case';
import { LoginUseCase } from '../../../application/use-cases/login-user.use-case';
import { RefreshSessionUseCase } from '../../../application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { RequestPasswordResetUseCase } from '../../../application/use-cases/request-password-reset.use-case';
import { RegisterCommand } from '../../../application/dto/register.command.dto';
import { LoginCommand } from '../../../application/dto/login.command.dto';
import { RefreshSessionCommand } from '../../../application/dto/refresh.command.dto';
import { RequestPasswordResetCommand } from '../../../application/dto/request-password-reset.command';
import { LogoutCommand } from '../../../application/dto/logout.command.dto';

import { RegisterRequestDto } from '../dto/register-request.dto';
import { LoginRequestDto } from '../dto/login-request.dto';
import { RefreshRequestDto } from '../dto/refresh-request.dto';
import { RequestPasswordResetRequestDto } from '../dto/request-password-reset-request.dto';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';

import {
  CorreoYaRegistradoError,
  CredencialesInvalidasError,
  SesionExpiradaError,
} from '../../../domain/errors/auth.errors';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterRequestDto) {
    try {
      const command = new RegisterCommand(dto.email, dto.password, dto.nombre, dto.telefono);
      return await this.registerUserUseCase.execute(command);
    } catch (error) {
      if (error instanceof CorreoYaRegistradoError) {
        throw new ConflictException(error.message);
      }
      throw new BadRequestException('No se pudo completar el registro');
    }
  }

  @Post('login')
  async login(@Body() dto: LoginRequestDto) {
    try {
      const command = new LoginCommand(dto.email, dto.password);
      return await this.loginUseCase.execute(command);
    } catch (error) {
      if (error instanceof CredencialesInvalidasError) {
        throw new UnauthorizedException(error.message);
      }
      throw new BadRequestException('No se pudo iniciar sesión');
    }
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshRequestDto) {
    try {
      const command = new RefreshSessionCommand(dto.refresh_token);
      return await this.refreshSessionUseCase.execute(command);
    } catch (error) {
      if (error instanceof SesionExpiradaError) {
        throw new UnauthorizedException(error.message);
      }
      throw new BadRequestException('No se pudo renovar la sesión');
    }
  }

  @Post('logout')
  @UseGuards(SupabaseAuthGuard)
  async logout(@Headers('authorization') authorization?: string) {
    try {
      const accessToken = authorization?.replace(/^Bearer\s+/i, '');
      if (!accessToken) {
        throw new UnauthorizedException('Token no proporcionado');
      }

      return await this.logoutUseCase.execute(new LogoutCommand(accessToken));
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException('No se pudo cerrar la sesión');
    }
  }

  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestPasswordResetRequestDto) {
    const command = new RequestPasswordResetCommand(dto.email);
    return this.requestPasswordResetUseCase.execute(command);
  }

}