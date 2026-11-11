export interface ProcessedMessageRepository {
  existsByProviderMessageId(providerMessageId: string): Promise<boolean>;
}

export const PROCESSED_MESSAGE_REPOSITORY = Symbol('ProcessedMessageRepository');
