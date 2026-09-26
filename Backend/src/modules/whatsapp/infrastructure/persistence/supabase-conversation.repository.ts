import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { Conversation } from '../../domain/entities/conversation.entity';
import { ConversationMapper } from './conversation.mapper';

@Injectable()
export class SupabaseConversationRepository implements ConversationRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(id: string): Promise<Conversation | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('conversaciones')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? ConversationMapper.toDomain(data) : null;
  }

  async findActiveByBusinessAndCustomer(
    businessId: string,
    customerNumber: string,
  ): Promise<Conversation | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('conversaciones')
      .select('*')
      .eq('negocio_id', businessId)
      .eq('numero_cliente', customerNumber)
      .eq('estado', 'activa')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? ConversationMapper.toDomain(data) : null;
  }

  async save(conversation: Conversation): Promise<void> {
    const client = this.supabaseService.getClient();
    const row = ConversationMapper.toPersistence(conversation);

    const { error } = await client.from('conversaciones').upsert(row);

    if (error) {
      throw error;
    }
  }
}
