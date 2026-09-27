import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { RecordTokenUsageCommand, TokenUsagePort } from '../../application/ports/out/token-usage.port';

@Injectable()
export class SupabaseTokenUsageAdapter implements TokenUsagePort {
  constructor(private readonly supabaseService: SupabaseService) {}

  async record(command: RecordTokenUsageCommand): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client.from('consumo_ia').insert({
      negocio_id: command.businessId,
      conversacion_id: command.conversationId,
      mensaje_id: command.messageId ?? null,
      tokens_entrada: command.tokensInput,
      tokens_salida: command.tokensOutput,
    });

    if (error) {
      throw error;
    }
  }
}