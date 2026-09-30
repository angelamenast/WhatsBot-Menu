export interface ProcessCustomerMessageCommand {
  businessId: string;
  conversationId: string;
  customerNumber: string;
  message: string;
}