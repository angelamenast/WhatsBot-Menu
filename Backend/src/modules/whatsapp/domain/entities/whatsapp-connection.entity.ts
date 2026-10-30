import { randomUUID } from 'node:crypto';

export enum WhatsappConnectionStatus {
  PENDING = 'PENDING',
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED',
}

export interface WhatsappConnectionProps {
  id: string;
  businessId: string;
  /** Identificador del número en el proveedor; es por el que llegan los mensajes entrantes. */
  phoneNumberId: string;
  wabaId: string;
  /** Número visible (solo dígitos). Null hasta que el proveedor lo confirma. */
  phoneNumber: string | null;
  status: WhatsappConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsappConnection {
  private constructor(private props: WhatsappConnectionProps) {}

  static create(props: WhatsappConnectionProps): WhatsappConnection {
    return new WhatsappConnection(props);
  }

  static request(params: { businessId: string; phoneNumberId: string; wabaId: string }): WhatsappConnection {
    const now = new Date();
    return new WhatsappConnection({
      id: randomUUID(),
      businessId: params.businessId,
      phoneNumberId: params.phoneNumberId,
      wabaId: params.wabaId,
      phoneNumber: null,
      status: WhatsappConnectionStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get businessId(): string {
    return this.props.businessId;
  }

  get phoneNumberId(): string {
    return this.props.phoneNumberId;
  }

  get wabaId(): string {
    return this.props.wabaId;
  }

  get phoneNumber(): string | null {
    return this.props.phoneNumber;
  }

  get status(): WhatsappConnectionStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  requestReconnect(phoneNumberId: string, wabaId: string): void {
    this.props.phoneNumberId = phoneNumberId;
    this.props.wabaId = wabaId;
    this.props.phoneNumber = null;
    this.props.status = WhatsappConnectionStatus.PENDING;
    this.props.updatedAt = new Date();
  }

  markConnected(phoneNumber: string): void {
    this.props.phoneNumber = phoneNumber;
    this.props.status = WhatsappConnectionStatus.CONNECTED;
    this.props.updatedAt = new Date();
  }

  markFailed(): void {
    this.props.status = WhatsappConnectionStatus.FAILED;
    this.props.updatedAt = new Date();
  }
}
