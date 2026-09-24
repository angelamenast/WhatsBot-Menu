import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../shared/supabase/supabase.service';

@Controller('health')
export class HealthController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('db')
  async checkDb() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('usuarios') 
      .select('*')
      .limit(1);

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, sample: data };
  }
}