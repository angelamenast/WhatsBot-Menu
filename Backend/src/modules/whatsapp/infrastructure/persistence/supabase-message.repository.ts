import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { MessageRepository } from '../../domain/repositories/message.repository';
import { Message } from '../../domain/entities/message.entity';
import { MessageMapper } from './message.mapper';

@Injectable()
export class SupabaseMessageRepository implements MessageRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async save(message: Message): Promise<void> {
    const client = this.supabaseService.getClient();
    const row = MessageMapper.toPersistence(message);

    const { error } = await client.from('mensajes').upsert(row);

    if (error) {
      throw error;
    }
  }

  async findByProviderMessageId(providerMessageId: string): Promise<Message | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mensajes')
      .select('*')
      .eq('twilio_message_sid', providerMessageId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? MessageMapper.toDomain(data) : null;
  }
}
