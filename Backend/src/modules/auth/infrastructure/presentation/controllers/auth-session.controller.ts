import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { BootstrapProfileDto } from '../dto/bootstrap-profile.dto';
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

  @Post('bootstrap')
  @UseGuards(SupabaseAuthGuard)
  async bootstrap(@Req() request: Request & { user: User }, @Body() dto: BootstrapProfileDto = {}) {
    const user = request.user;
    if (dto.createProfile === false) {
      const {data,error} = await this.supabaseService.getClient().from('usuarios').select('id').eq('id',user.id).is('deleted_at',null).maybeSingle();
      if (error) throw new BadRequestException('No se pudo verificar tu registro en Tremia');
      if (!data) throw new ForbiddenException('Esta cuenta no está registrada en Tremia. Regístrate primero.');
      return {ready:true};
    }
    const { error } = await this.supabaseService.getClient().from('usuarios').upsert({
      id: user.id,
      nombre: user.user_metadata.nombre || user.user_metadata.full_name || user.email?.split('@')[0] || 'Usuario',
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new BadRequestException('No se pudo preparar el perfil del usuario');
    return { ready: true };
  }

  @Get('google')
  async googleAuth(@Res() response: Response) {
    return response.redirect((await this.googleUrl()).url);
  }

  @Get('google/url')
  async googleUrl() {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4321';
    const { data, error } = await this.supabaseService.getClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${frontendUrl.replace(/\/$/, '')}/auth/callback`, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data.url) {
      throw new BadRequestException('No se pudo iniciar sesión con Google');
    }
    return { url: data.url };
  }
}
