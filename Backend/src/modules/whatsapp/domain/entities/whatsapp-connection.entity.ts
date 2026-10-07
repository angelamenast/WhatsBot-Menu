import { randomUUID } from 'node:crypto';

export enum WhatsappConnectionStatus {
  PENDING = 'PENDING',
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED',
}

export interface WhatsappConnectionProps {
  id: string;
  businessId: string;
  phoneNumber: string;
  twilioSubaccountSid: string | null;
  twilioSenderSid: string | null;
  status: WhatsappConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsappConnection {
  private constructor(private props: WhatsappConnectionProps) {}

  static create(props: WhatsappConnectionProps): WhatsappConnection {
    return new WhatsappConnection(props);
  }

  static request(params: { businessId: string; phoneNumber: string }): WhatsappConnection {
    const now = new Date();
    return new WhatsappConnection({
      id: randomUUID(),
      businessId: params.businessId,
      phoneNumber: params.phoneNumber,
      twilioSubaccountSid: null,
      twilioSenderSid: null,
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

  get phoneNumber(): string {
    return this.props.phoneNumber;
  }

  get twilioSubaccountSid(): string | null {
    return this.props.twilioSubaccountSid;
  }

  get twilioSenderSid(): string | null {
    return this.props.twilioSenderSid;
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

  requestReconnect(phoneNumber: string): void {
    this.props.phoneNumber = phoneNumber;
    this.props.twilioSubaccountSid = null;
    this.props.twilioSenderSid = null;
    this.props.status = WhatsappConnectionStatus.PENDING;
    this.props.updatedAt = new Date();
  }

  markConnected(twilioSubaccountSid: string, twilioSenderSid: string): void {
    this.props.twilioSubaccountSid = twilioSubaccountSid;
    this.props.twilioSenderSid = twilioSenderSid;
    this.props.status = WhatsappConnectionStatus.CONNECTED;
    this.props.updatedAt = new Date();
  }

  markFailed(): void {
    this.props.status = WhatsappConnectionStatus.FAILED;
    this.props.updatedAt = new Date();
  }
}
