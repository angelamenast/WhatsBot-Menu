import { randomUUID } from 'node:crypto';

export enum MessageSender {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
}

export type MessageDeliveryStatus = 'sent' | 'failed' | 'pending';

export interface MessageProps {
  id: string;
  conversationId: string;
  sender: MessageSender;
  content: string;
  providerMessageId: string | null;
  deliveryStatus: MessageDeliveryStatus | null;
  createdAt: Date;
}

export class Message {
  private constructor(private props: MessageProps) {}

  static create(props: MessageProps): Message {
    return new Message(props);
  }

  static receiveFromCustomer(params: {
    conversationId: string;
    content: string;
    providerMessageId: string;
  }): Message {
    return new Message({
      id: randomUUID(),
      conversationId: params.conversationId,
      sender: MessageSender.CUSTOMER,
      content: params.content,
      providerMessageId: params.providerMessageId,
      deliveryStatus: null,
      createdAt: new Date(),
    });
  }

  static sentByAgent(params: {
    conversationId: string;
    content: string;
    providerMessageId: string | null;
    deliveryStatus: MessageDeliveryStatus;
  }): Message {
    return new Message({
      id: randomUUID(),
      conversationId: params.conversationId,
      sender: MessageSender.AGENT,
      content: params.content,
      providerMessageId: params.providerMessageId,
      deliveryStatus: params.deliveryStatus,
      createdAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get sender(): MessageSender {
    return this.props.sender;
  }

  get content(): string {
    return this.props.content;
  }

  get providerMessageId(): string | null {
    return this.props.providerMessageId;
  }

  get deliveryStatus(): MessageDeliveryStatus | null {
    return this.props.deliveryStatus;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  updateDeliveryStatus(deliveryStatus: MessageDeliveryStatus): void {
    this.props.deliveryStatus = deliveryStatus;
  }
}
