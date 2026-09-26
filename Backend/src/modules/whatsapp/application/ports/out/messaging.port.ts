import { MessageDeliveryStatus } from '../../../domain/entities/message.entity';

export interface SendMessageResult {
  providerMessageId: string | null;
  status: MessageDeliveryStatus;
}

export interface MessagingPort {
  sendMessage(to: string, body: string): Promise<SendMessageResult>;
}

export const MESSAGING_PORT = Symbol('MessagingPort');
