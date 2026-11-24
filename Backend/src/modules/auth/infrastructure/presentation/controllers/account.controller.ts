import { BadRequestException, Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { UpdateAccountDto } from '../dto/update-account.dto';

// Una cuenta creada con Google tiene providers = ['google'] aunque después cree una contraseña:
// Supabase no añade 'email'. Por eso, al crearla, se marca app_metadata.password_set (solo lo
// escribe el servidor con la service role; el usuario no puede alterarlo).
export function accountHasPassword(user: Pick<User, 'app_metadata'>): boolean {
  const providers = user.app_metadata?.providers;
  return !Array.isArray(providers) || providers.includes('email') || user.app_metadata?.password_set === true;
}

@Controller('auth/account')
@UseGuards(SupabaseAuthGuard)
export class AccountController {
  constructor(private readonly config: ConfigService) {}

  @Patch()
  async update(@Req() request: Request & { user: User }, @Body() dto: UpdateAccountDto) {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    const changes: Record<string, unknown> = {};
    if (dto.nombre !== undefined) {
      if (!dto.nombre.trim()) throw new BadRequestException('Escribe tu nombre');
      changes.data = { nombre: dto.nombre.trim(), full_name: dto.nombre.trim() };
    }
    if (dto.email) changes.email = dto.email;
    const creatingPassword = Boolean(dto.password) && !accountHasPassword(request.user);
    if (dto.password) {
      // Quien solo entra con Google y aún no creó contraseña no tiene una actual que comprobar.
      // Sin la lista de proveedores se exige la contraseña actual.
      if (!creatingPassword) {
        if (!dto.currentPassword || !request.user.email) throw new BadRequestException('Escribe tu contraseña actual');
        // Cliente aislado: la comprobación no altera sesiones de otros usuarios.
        const isolated = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await isolated.auth.signInWithPassword({ email: request.user.email, password: dto.currentPassword });
        if (error || data.user?.id !== request.user.id) throw new BadRequestException('Contraseña actual incorrecta');
      }
      changes.password = dto.password;
    }
    if (!Object.keys(changes).length) throw new BadRequestException('No hay cambios para guardar');
    // GoTrue recibe el JWT del usuario, conserva las confirmaciones de email y sus políticas de seguridad.
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: key, Authorization: request.headers.authorization!, 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const result = await response.json();
    if (!response.ok) throw new BadRequestException('No se pudo actualizar la cuenta. Comprueba los datos o vuelve a iniciar sesión.');
    if (creatingPassword) {
      // GoTrue combina app_metadata: solo se añade la marca, sin tocar providers.
      const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await admin.auth.admin.updateUserById(request.user.id, { app_metadata: { password_set: true } });
      if (error) throw new BadRequestException('La contraseña se creó, pero no se pudo registrar en tu cuenta. Vuelve a intentarlo.');
      result.app_metadata = { ...result.app_metadata, password_set: true };
    }
    return { user: result };
  }
}
