import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';

type EstadoConversacion = 'activa' | 'cerrada';

interface ConversacionRow {
  id: string;
  negocio_id: string;
  numero_cliente: string;
  estado: EstadoConversacion;
  created_at: string;
  updated_at: string;
}

const ESTADO_TO_STATUS: Record<EstadoConversacion, ConversationStatus> = {
  activa: ConversationStatus.ACTIVE,
  cerrada: ConversationStatus.CLOSED,
};

const STATUS_TO_ESTADO: Record<ConversationStatus, EstadoConversacion> = {
  [ConversationStatus.ACTIVE]: 'activa',
  [ConversationStatus.CLOSED]: 'cerrada',
};

export class ConversationMapper {
  static toDomain(row: ConversacionRow): Conversation {
    return Conversation.create({
      id: row.id,
      businessId: row.negocio_id,
      customerNumber: row.numero_cliente,
      status: ESTADO_TO_STATUS[row.estado],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toPersistence(conversation: Conversation): Omit<ConversacionRow, 'created_at'> {
    return {
      id: conversation.id,
      negocio_id: conversation.businessId,
      numero_cliente: conversation.customerNumber,
      estado: STATUS_TO_ESTADO[conversation.status],
      updated_at: conversation.updatedAt.toISOString(),
    };
  }
}
