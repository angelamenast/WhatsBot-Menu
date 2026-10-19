export interface ProcessCustomerMessageCommand {
  businessId: string;
  conversationId: string;
  /** Id del mensaje entrante, ya persistido en `mensajes`. */
  messageId: string;
  customerNumber: string;
  message: string;
}