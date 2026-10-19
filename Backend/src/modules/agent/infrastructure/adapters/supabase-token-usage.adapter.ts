import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { RecordTokenUsageCommand, TokenUsagePort } from '../../application/ports/out/token-usage.port';

@Injectable()
export class SupabaseTokenUsageAdapter implements TokenUsagePort {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Una sola llamada a `registrar_consumo_ia`: inserta en `consumo_ia` y suma en
   * `contador_uso_periodo` dentro de la misma transacción.
   */
  async record(command: RecordTokenUsageCommand): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client.rpc('registrar_consumo_ia', {
      p_negocio_id: command.businessId,
      p_conversacion_id: command.conversationId,
      p_mensaje_id: command.messageId ?? null,
      p_tokens_entrada: command.tokensInput,
      p_tokens_salida: command.tokensOutput,
    });

    if (error) {
      throw error;
    }
  }
}
