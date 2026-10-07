import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';

type EstadoConexion = 'pendiente' | 'conectado' | 'fallido';

interface ConexionWhatsappRow {
  id: string;
  negocio_id: string;
  numero_whatsapp: string;
  twilio_subaccount_sid: string | null;
  twilio_sender_sid: string | null;
  estado: EstadoConexion;
  created_at: string;
  updated_at: string;
}

const ESTADO_TO_STATUS: Record<EstadoConexion, WhatsappConnectionStatus> = {
  pendiente: WhatsappConnectionStatus.PENDING,
  conectado: WhatsappConnectionStatus.CONNECTED,
  fallido: WhatsappConnectionStatus.FAILED,
};

const STATUS_TO_ESTADO: Record<WhatsappConnectionStatus, EstadoConexion> = {
  [WhatsappConnectionStatus.PENDING]: 'pendiente',
  [WhatsappConnectionStatus.CONNECTED]: 'conectado',
  [WhatsappConnectionStatus.FAILED]: 'fallido',
};

export class WhatsappConnectionMapper {
  static toDomain(row: ConexionWhatsappRow): WhatsappConnection {
    return WhatsappConnection.create({
      id: row.id,
      businessId: row.negocio_id,
      phoneNumber: row.numero_whatsapp,
      twilioSubaccountSid: row.twilio_subaccount_sid,
      twilioSenderSid: row.twilio_sender_sid,
      status: ESTADO_TO_STATUS[row.estado],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toPersistence(connection: WhatsappConnection): Omit<ConexionWhatsappRow, 'created_at'> {
    return {
      id: connection.id,
      negocio_id: connection.businessId,
      numero_whatsapp: connection.phoneNumber,
      twilio_subaccount_sid: connection.twilioSubaccountSid,
      twilio_sender_sid: connection.twilioSenderSid,
      estado: STATUS_TO_ESTADO[connection.status],
      updated_at: connection.updatedAt.toISOString(),
    };
  }
}
