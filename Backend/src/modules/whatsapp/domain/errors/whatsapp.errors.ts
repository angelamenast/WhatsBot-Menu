export class WhatsappConnectionNotFoundError extends Error {
  /** `reference` identifica la conexión buscada (un phone_number_id o un negocio), nunca un teléfono de cliente. */
  constructor(reference: string) {
    super(`No existe una conexión de WhatsApp para ${reference}`);
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
  /** `identifier` es el phone_number_id o el número visible que ya está vinculado. */
  constructor(identifier: string) {
    super(`El número ${identifier} ya está vinculado a otro negocio`);
    this.name = 'PhoneNumberAlreadyLinkedError';
  }
}

export class ActiveConversationAlreadyExistsError extends Error {
  // Sin businessId ni número: el mensaje de la BD que originó este error trae el teléfono del cliente.
  constructor() {
    super('Ya existe una conversación activa para este cliente en el negocio');
    this.name = 'ActiveConversationAlreadyExistsError';
  }
}

export class InvalidMessageBodyError extends Error {
  constructor(reason: string) {
    super(`Cuerpo de mensaje inválido: ${reason}`);
    this.name = 'InvalidMessageBodyError';
  }
}

/**
 * Error del proveedor de mensajería (la Graph API de Meta). `providerCode` y `traceId` son el
 * `code` y el `fbtrace_id` de la respuesta; null si no hubo respuesta (red, timeout).
 */
export class WhatsappProviderError extends Error {
  constructor(
    message: string,
    readonly providerCode: number | null = null,
    readonly traceId: string | null = null,
  ) {
    super(message);
    this.name = 'WhatsappProviderError';
  }
}

/** Token de acceso inválido o vencido. */
export class WhatsappProviderAuthError extends WhatsappProviderError {
  constructor(message: string, providerCode: number | null, traceId: string | null) {
    super(message, providerCode, traceId);
    this.name = 'WhatsappProviderAuthError';
  }
}

/** Pasaron más de 24 h desde el último mensaje del cliente: solo se admiten plantillas. */
export class MessagingWindowClosedError extends WhatsappProviderError {
  constructor(message: string, providerCode: number | null, traceId: string | null) {
    super(message, providerCode, traceId);
    this.name = 'MessagingWindowClosedError';
  }
}

export class WhatsappProviderTimeoutError extends WhatsappProviderError {
  constructor() {
    super('La Graph API no respondió a tiempo');
    this.name = 'WhatsappProviderTimeoutError';
  }
}
