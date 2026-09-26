export type ProvisioningResult =
  | { status: 'connected'; subaccountSid: string; senderSid: string }
  | { status: 'failed' };

export interface ProvisioningPort {
  provision(phoneNumber: string): Promise<ProvisioningResult>;
}

export const PROVISIONING_PORT = Symbol('ProvisioningPort');
