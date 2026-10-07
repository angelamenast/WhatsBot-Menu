import { Message, MessageDeliveryStatus, MessageSender } from '../../domain/entities/message.entity';

type Remitente = 'cliente' | 'agente_ia' | 'sistema';
type EstadoEnvio = 'enviado' | 'fallido' | 'pendiente';

interface MensajeRow {
  id: string;
  conversacion_id: string;
  remitente: Remitente;
  contenido: string;
  twilio_message_sid: string | null;
  estado_envio: EstadoEnvio | null;
  created_at: string;
}

const REMITENTE_TO_SENDER: Record<Remitente, MessageSender> = {
  cliente: MessageSender.CUSTOMER,
  agente_ia: MessageSender.AGENT,
  sistema: MessageSender.SYSTEM,
};

const SENDER_TO_REMITENTE: Record<MessageSender, Remitente> = {
  [MessageSender.CUSTOMER]: 'cliente',
  [MessageSender.AGENT]: 'agente_ia',
  [MessageSender.SYSTEM]: 'sistema',
};

const ESTADO_TO_DELIVERY_STATUS: Record<EstadoEnvio, MessageDeliveryStatus> = {
  enviado: 'sent',
  fallido: 'failed',
  pendiente: 'pending',
};

const DELIVERY_STATUS_TO_ESTADO: Record<MessageDeliveryStatus, EstadoEnvio> = {
  sent: 'enviado',
  failed: 'fallido',
  pending: 'pendiente',
};

export class MessageMapper {
  static toDomain(row: MensajeRow): Message {
    return Message.create({
      id: row.id,
      conversationId: row.conversacion_id,
      sender: REMITENTE_TO_SENDER[row.remitente],
      content: row.contenido,
      providerMessageId: row.twilio_message_sid,
      deliveryStatus: row.estado_envio ? ESTADO_TO_DELIVERY_STATUS[row.estado_envio] : null,
      createdAt: new Date(row.created_at),
    });
  }

  static toPersistence(message: Message): Omit<MensajeRow, 'created_at'> {
    return {
      id: message.id,
      conversacion_id: message.conversationId,
      remitente: SENDER_TO_REMITENTE[message.sender],
      contenido: message.content,
      twilio_message_sid: message.providerMessageId,
      estado_envio: message.deliveryStatus ? DELIVERY_STATUS_TO_ESTADO[message.deliveryStatus] : null,
    };
  }
}
