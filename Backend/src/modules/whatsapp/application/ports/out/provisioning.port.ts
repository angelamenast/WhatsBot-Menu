export type ProvisioningResult =
  | { status: 'connected'; displayPhoneNumber: string }
  | { status: 'failed' };

export interface ProvisioningPort {
  /** Valida un número que ya existe en el proveedor y devuelve su número visible. No aprovisiona nada. */
  link(phoneNumberId: string): Promise<ProvisioningResult>;
}

export const PROVISIONING_PORT = Symbol('ProvisioningPort');
