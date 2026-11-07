import { randomUUID } from 'node:crypto';

export enum ConversationStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export interface ConversationProps {
  id: string;
  businessId: string;
  customerNumber: string;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Conversation {
  private constructor(private props: ConversationProps) {}

  static create(props: ConversationProps): Conversation {
    return new Conversation(props);
  }

  static start(params: { businessId: string; customerNumber: string }): Conversation {
    const now = new Date();
    return new Conversation({
      id: randomUUID(),
      businessId: params.businessId,
      customerNumber: params.customerNumber,
      status: ConversationStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Transición activa → cerrada. Idempotente: cerrar una conversación ya cerrada no hace nada
   * (no cambia `updatedAt`), para que reintentos y eventos repetidos sean inofensivos.
   */
  close(now: Date = new Date()): void {
    if (this.props.status === ConversationStatus.CLOSED) {
      return;
    }

    this.props.status = ConversationStatus.CLOSED;
    this.props.updatedAt = now;
  }

  get id(): string {
    return this.props.id;
  }

  get businessId(): string {
    return this.props.businessId;
  }

  get customerNumber(): string {
    return this.props.customerNumber;
  }

  get status(): ConversationStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
