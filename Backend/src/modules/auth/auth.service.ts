import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { handleSupabaseAuthError } from './utils/supabase-error.util';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async register(dto: RegisterDto) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { nombre: dto.nombre },
    });

    if (error) {
      handleSupabaseAuthError(error);
    }

    const { error: insertError } = await client
      .from('usuarios')
      .insert({
        id: data.user.id,
        nombre: dto.nombre,
        telefono: dto.telefono ?? null,
      });

    if (insertError) {
      // Si falla el perfil, limpiamos el usuario de Auth para no dejar huérfanos
      await client.auth.admin.deleteUser(data.user.id);
      throw new BadRequestException('No se pudo completar el registro. Intenta de nuevo');
    }

    return { id: data.user.id, email: data.user.email, nombre: dto.nombre };
  }

  async login(dto: LoginDto) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    };
  }

  async refresh(refreshToken: string) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Sesión expirada, inicia sesión de nuevo');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    };
  }

  async logout(accessToken: string) {
    const client = this.supabaseService.getClient();
    const { error } = await client.auth.admin.signOut(accessToken);

    if (error) {
      throw new BadRequestException('No se pudo cerrar la sesión');
    }

    return { message: 'Sesión cerrada correctamente' };
  }

  async requestPasswordReset(email: string) {
    const client = this.supabaseService.getClient();
    const { error } = await client.auth.resetPasswordForEmail(email);

    if (error) {
      // Nunca revelamos si el correo existe o no (seguridad)
    }

    return { message: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña' };
  }
}