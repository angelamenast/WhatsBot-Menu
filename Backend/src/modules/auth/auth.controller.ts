import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Res } from '@nestjs/common/decorators/http/route-params.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
//import { Throttle } from '@nestjs/throttler/dist/throttler.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  async googleAuth(@Res() res: Response) {
    const { url } = await this.authService.loginWithGoogle();
    return res.redirect(url); // Redirige automáticamente al usuario a la pantalla de cuentas de Google
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('me')
  getMe(@Req() req: Request) {
    return { user: (req as Request & { user: unknown }).user };
  }

  @UseGuards(SupabaseAuthGuard)
  @Post('logout')
  logout(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    const token = authHeader.split(' ')[1];
    return this.authService.logout(token);
  }
}
