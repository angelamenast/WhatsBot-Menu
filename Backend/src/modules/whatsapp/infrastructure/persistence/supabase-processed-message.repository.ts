import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { ProcessedMessageRepository } from '../../domain/repositories/processed-message.repository';

@Injectable()
export class SupabaseProcessedMessageRepository implements ProcessedMessageRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async existsByProviderMessageId(providerMessageId: string): Promise<boolean> {
    const client = this.supabaseService.getClient();

    const { count, error } = await client
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('twilio_message_sid', providerMessageId);

    if (error) {
      throw error;
    }

    return (count ?? 0) > 0;
  }
}
