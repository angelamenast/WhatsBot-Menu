import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import { WhatsappConnection } from '../../domain/entities/whatsapp-connection.entity';
import { WhatsappConnectionMapper } from './whatsapp-connection.mapper';

@Injectable()
export class SupabaseWhatsappConnectionRepository implements WhatsappConnectionRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findByBusinessId(businessId: string): Promise<WhatsappConnection | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('conexiones_whatsapp')
      .select('*')
      .eq('negocio_id', businessId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? WhatsappConnectionMapper.toDomain(data) : null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<WhatsappConnection | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('conexiones_whatsapp')
      .select('*')
      .eq('numero_whatsapp', phoneNumber)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? WhatsappConnectionMapper.toDomain(data) : null;
  }

  async save(connection: WhatsappConnection): Promise<void> {
    const client = this.supabaseService.getClient();
    const row = WhatsappConnectionMapper.toPersistence(connection);

    const { error } = await client
      .from('conexiones_whatsapp')
      .upsert(row, { onConflict: 'negocio_id' });

    if (error) {
      throw error;
    }
  }
}
