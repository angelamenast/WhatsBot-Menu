import { WhatsappConnection } from '../entities/whatsapp-connection.entity';

export interface WhatsappConnectionRepository {
  findByBusinessId(businessId: string): Promise<WhatsappConnection | null>;
  findByPhoneNumber(phoneNumber: string): Promise<WhatsappConnection | null>;
  save(connection: WhatsappConnection): Promise<void>;
}

export const WHATSAPP_CONNECTION_REPOSITORY = Symbol('WhatsappConnectionRepository');
