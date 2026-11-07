import { WhatsappConnection } from '../entities/whatsapp-connection.entity';

export interface WhatsappConnectionRepository {
  findByBusinessId(businessId: string): Promise<WhatsappConnection | null>;
  /** Por número visible (solo dígitos). */
  findByPhoneNumber(phoneNumber: string): Promise<WhatsappConnection | null>;
  findByPhoneNumberId(phoneNumberId: string): Promise<WhatsappConnection | null>;
  save(connection: WhatsappConnection): Promise<void>;
}

export const WHATSAPP_CONNECTION_REPOSITORY = Symbol('WhatsappConnectionRepository');
