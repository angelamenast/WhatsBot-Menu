import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';

type EstadoConexion = 'pendiente' | 'conectado' | 'fallido';

interface ConexionWhatsappRow {
  id: string;
  negocio_id: string;
  phone_number_id: string;
  waba_id: string;
  numero_whatsapp: string | null;
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
      phoneNumberId: row.phone_number_id,
      wabaId: row.waba_id,
      phoneNumber: row.numero_whatsapp,
      status: ESTADO_TO_STATUS[row.estado],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toPersistence(connection: WhatsappConnection): Omit<ConexionWhatsappRow, 'created_at'> {
    return {
      id: connection.id,
      negocio_id: connection.businessId,
      phone_number_id: connection.phoneNumberId,
      waba_id: connection.wabaId,
      numero_whatsapp: connection.phoneNumber,
      estado: STATUS_TO_ESTADO[connection.status],
      updated_at: connection.updatedAt.toISOString(),
    };
  }
}
