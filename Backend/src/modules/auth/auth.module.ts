import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/presentation/controllers/auth.controller';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login-user.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { AUTH_REPOSITORY } from './domain/repositories/auth.repository';
import { SupabaseAuthRepository } from './infrastructure/persistence/supabase-auth.repository';
import { SupabaseAuthGuard } from './infrastructure/presentation/guards/supabase-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    RegisterUserUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    SupabaseAuthRepository,
    { provide: AUTH_REPOSITORY, useExisting: SupabaseAuthRepository },
    SupabaseAuthGuard,
  ],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}