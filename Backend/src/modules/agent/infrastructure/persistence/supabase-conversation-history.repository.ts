import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import {
  ConversationHistoryRepository,
  HistoryMessage,
  HistorySender,
} from '../../domain/repositories/conversation-history.repository';

type Remitente = 'cliente' | 'agente_ia';

interface MensajeRow {
  remitente: Remitente;
  contenido: string;
  created_at: string;
}

const REMITENTE_TO_SENDER: Record<Remitente, HistorySender> = {
  cliente: 'CUSTOMER',
  agente_ia: 'AGENT',
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
    excludeMessageId: string,
  ): Promise<HistoryMessage[]> {
    const client = this.supabaseService.getClient();

    // El mensaje entrante se excluye por id (ya viaja aparte como `customerMessage`).
    // Solo cuentan los mensajes del cliente y del agente. Las respuestas del agente cuyo envío
    // falló nunca llegaron al cliente: se excluyen. Los del cliente tienen estado_envio nulo
    // y por eso el filtro admite null explícitamente (un `neq` solo descartaría los null).
    // Orden estable: created_at y, en empate, id.
    const { data, error } = await client
      .from('mensajes')
      .select('remitente, contenido, created_at')
      .eq('conversacion_id', conversationId)
      .neq('id', excludeMessageId)
      .in('remitente', ['cliente', 'agente_ia'])
      .or('estado_envio.is.null,estado_envio.neq.fallido')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
      .returns<MensajeRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? [])
      .slice()
      .reverse()
      .map((row) => ({
        sender: REMITENTE_TO_SENDER[row.remitente],
        content: row.contenido,
        createdAt: new Date(row.created_at),
      }));
  }
}
