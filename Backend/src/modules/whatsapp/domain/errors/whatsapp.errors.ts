export class WhatsappConnectionNotFoundError extends Error {
  constructor(phoneNumber: string) {
    super(`No existe una conexión de WhatsApp para el número ${phoneNumber}`);
    this.name = 'WhatsappConnectionNotFoundError';
  }
}

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`No existe una conversación con id ${conversationId}`);
    this.name = 'ConversationNotFoundError';
  }
}

export class PhoneNumberAlreadyLinkedError extends Error {
  constructor(phoneNumber: string) {
    super(`El número ${phoneNumber} ya está vinculado a otro negocio`);
    this.name = 'PhoneNumberAlreadyLinkedError';
  }
}
