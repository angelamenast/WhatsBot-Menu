import { MessageDeliveryStatus } from '../../../domain/entities/message.entity';

export interface SendMessageParams {
  /** Identificador del número del negocio desde el que se envía. */
  phoneNumberId: string;
  to: string;
  body: string;
}

export interface SendMessageResult {
  providerMessageId: string | null;
  status: MessageDeliveryStatus;
}

export interface MessagingPort {
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
}

export const MESSAGING_PORT = Symbol('MessagingPort');
