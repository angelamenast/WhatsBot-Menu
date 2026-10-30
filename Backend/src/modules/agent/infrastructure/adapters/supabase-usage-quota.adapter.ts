import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { UsageQuotaPort } from '../../application/ports/out/usage-quota.port';

interface CuotaTokensRow {
  hay_suscripcion: boolean;
  limite_tokens: number | string | null;
  tokens_usados: number | string | null;
}

/**
 * Lee la cuota con la función SQL `consultar_cuota_tokens`, que también calcula el periodo:
 * así la lectura y la escritura (`registrar_consumo_ia`) comparten la misma definición.
 */
@Injectable()
export class SupabaseUsageQuotaAdapter implements UsageQuotaPort {
  private readonly logger = new Logger(SupabaseUsageQuotaAdapter.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async hasQuota(businessId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('consultar_cuota_tokens', { p_negocio_id: businessId })
        .returns<CuotaTokensRow[]>();

      if (error) {
        throw error;
      }

      const row = (data as CuotaTokensRow[] | null)?.[0];

      // Sin suscripción vigente no hay cuota (el plan vencido ya lo corta whatsapp antes).
      if (!row || !row.hay_suscripcion) {
        return false;
      }

      // Límite null = plan ilimitado.
      if (row.limite_tokens === null || row.limite_tokens === undefined) {
        return true;
      }

      return Number(row.tokens_usados ?? 0) < Number(row.limite_tokens);
    } catch (error) {
      // Decisión explícita: ante un fallo de la consulta se prioriza la disponibilidad.
      this.logger.error(
        `No se pudo consultar la cuota de tokens del negocio ${businessId} (se permite responder): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }
  }
}
