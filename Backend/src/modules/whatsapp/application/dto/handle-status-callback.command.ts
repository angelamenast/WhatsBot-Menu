export type ProviderMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface HandleStatusCallbackCommand {
  providerMessageId: string;
  status: ProviderMessageStatus;
  /** Detalle del fallo que reporta el proveedor; solo viene con status "failed". */
  error?: { code: number; message: string };
}
