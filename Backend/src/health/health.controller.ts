import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SupabaseService } from '../shared/supabase/supabase.service';

// Público a propósito (lo usan Railway y los monitores), así que nunca devuelve filas ni detalles de error.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly supabaseService: SupabaseService) {}

  /** Vida del proceso: no toca la base de datos. Es el health check del despliegue. */
  @Get()
  check() {
    return { ok: true };
  }

  /** Conectividad con Supabase. Responde 503 si la consulta falla. */
  @Get('db')
  async checkDb() {
    const { error } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    if (error) {
      throw new ServiceUnavailableException({ ok: false });
    }
    return { ok: true };
  }
}
