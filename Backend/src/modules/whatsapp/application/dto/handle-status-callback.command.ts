export type TwilioMessageStatus = 'sent' | 'delivered' | 'failed' | 'undelivered';

export interface HandleStatusCallbackCommand {
  providerMessageId: string;
  status: TwilioMessageStatus;
}
