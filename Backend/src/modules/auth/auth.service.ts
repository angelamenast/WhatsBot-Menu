import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
      throw new BadRequestException(error.message);
    }

    const { error: insertError } = await client.from('usuarios').insert({
      id: data.user.id,
      nombre: dto.nombre,
      telefono: dto.telefono ?? null,
    });

    if (insertError) {
      await client.auth.admin.deleteUser(data.user.id);
      throw new BadRequestException(insertError.message);
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
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    };
  }

  async requestPasswordReset(email: string) {
    const client = this.supabaseService.getClient();
    const { error } = await client.auth.resetPasswordForEmail(email);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'Correo de recuperación enviado' };
  }
}