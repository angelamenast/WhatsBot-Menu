import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { AuthRepository, SesionAuth } from '../../domain/repositories/auth.repository';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UsuarioMapper } from './usuario.mapper';
import {
  CredencialesInvalidasError,
  CorreoYaRegistradoError,
  SesionExpiradaError,
} from '../../domain/errors/auth.errors';

@Injectable()
export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async crearUsuarioAuth(
    email: string,
    password: string,
    nombre: string,
  ): Promise<{ id: string; email: string }> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') || msg.includes('duplicate')) {
        throw new CorreoYaRegistradoError();
      }
      throw new Error(error.message);
    }

    return { id: data.user.id, email: data.user.email ?? email };
  }

  async crearPerfil(
    id: string,
    nombre: string,
    telefono: string | null,
  ): Promise<Usuario> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('usuarios')
      .insert(UsuarioMapper.toInsert(id, nombre, telefono))
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return UsuarioMapper.toDomain(data);
  }

  async eliminarUsuarioAuth(id: string): Promise<void> {
    const client = this.supabaseService.getClient();
    await client.auth.admin.deleteUser(id);
    // No lanzamos error aquí a propósito: esto se usa como rollback
    // dentro de RegisterUserUseCase, y si falla el rollback, preferimos
    // no ocultar el error original que causó el rollback.
  }

  async login(email: string, password: string): Promise<SesionAuth> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new CredencialesInvalidasError();
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  async refresh(refreshToken: string): Promise<SesionAuth> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new SesionExpiradaError();
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  async logout(accessToken: string): Promise<void> {
    const client = this.supabaseService.getClient();
    const { error } = await client.auth.admin.signOut(accessToken);

    if (error) {
      throw new Error('No se pudo cerrar la sesión');
    }
  }

  async solicitarRecuperacion(email: string): Promise<void> {
    const client = this.supabaseService.getClient();
    // A propósito no revisamos el error aquí -- ya en el use-case
    // (cuando lo armemos) nunca se revela si el correo existe o no,
    // así que da igual si Supabase reporta error o éxito.
    await client.auth.resetPasswordForEmail(email);
  }
}