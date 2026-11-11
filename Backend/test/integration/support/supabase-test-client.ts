import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseService } from '../../../src/shared/supabase/supabase.service';
import { loadTestEnv } from './env';

export function createTestClient(): SupabaseClient {
  const { url, serviceRoleKey } = loadTestEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Los repositorios reales solo usan SupabaseService.getClient(): se les entrega este
 * sustituto con el cliente de pruebas, sin tocar el código de producción.
 */
export function asSupabaseService(client: SupabaseClient): SupabaseService {
  return { getClient: () => client } as unknown as SupabaseService;
}
