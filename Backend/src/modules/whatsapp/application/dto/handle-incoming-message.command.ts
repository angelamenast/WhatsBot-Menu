export interface HandleIncomingMessageCommand {
  toPhoneNumber: string;
  fromCustomerNumber: string;
  body: string;
  providerMessageId: string;
}
