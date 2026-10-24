import { BadRequestException, Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from '../../../../../shared/supabase/supabase.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';

@Controller('auth')
export class AuthSessionController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getMe(@Req() request: Request & { user: User }) {
    return { user: request.user };
  }

  @Get('google')
  async googleAuth(@Res() response: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4321';
    const { data, error } = await this.supabaseService.getClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${frontendUrl.replace(/\/$/, '')}/auth/callback` },
    });
    if (error || !data.url) {
      throw new BadRequestException('No se pudo iniciar sesión con Google');
    }
    return response.redirect(data.url);
  }
}
