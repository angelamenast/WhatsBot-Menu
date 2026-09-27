import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import {
  ConversationHistoryRepository,
  HistoryMessage,
  HistorySender,
} from '../../domain/repositories/conversation-history.repository';

type Remitente = 'cliente' | 'agente_ia' | 'sistema';

interface MensajeRow {
  remitente: Remitente;
  contenido: string;
  created_at: string;
}

const REMITENTE_TO_SENDER: Record<Remitente, HistorySender> = {
  cliente: 'CUSTOMER',
  agente_ia: 'AGENT',
  sistema: 'SYSTEM',
};

@Injectable()
export class SupabaseConversationHistoryRepository implements ConversationHistoryRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async countByConversationId(conversationId: string): Promise<number> {
    const client = this.supabaseService.getClient();

    const { count, error } = await client
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conversationId);

    if (error) {
      throw error;
    }

    return count ?? 0;
  }

  async findRecentByConversationId(
    conversationId: string,
    limit: number,
  ): Promise<HistoryMessage[]> {
    const client = this.supabaseService.getClient();

    // Se piden limit + 1: al llegar aquí, el mensaje actual del cliente ya fue
    // persistido por whatsapp (ver handle-incoming-message.use-case.ts), así que
    // el más reciente de este query ES el mensaje actual. Se descarta con slice(1)
    // para no duplicarlo (ya se pasa aparte como `customerMessage` al LLM).
    const { data, error } = await client
      .from('mensajes')
      .select('remitente, contenido, created_at')
      .eq('conversacion_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1)
      .returns<MensajeRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? [])
      .slice(1)
      .reverse()
      .map((row) => ({
        sender: REMITENTE_TO_SENDER[row.remitente],
        content: row.contenido,
        createdAt: new Date(row.created_at),
      }));
  }
}
