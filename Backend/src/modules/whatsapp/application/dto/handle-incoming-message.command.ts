export interface HandleIncomingMessageCommand {
  /** Identificador del número del negocio que recibió el mensaje (no el número visible). */
  phoneNumberId: string;
  customerNumber: string;
  text: string;
  providerMessageId: string;
}
