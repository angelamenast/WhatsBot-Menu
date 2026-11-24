import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { WhatsappConnection } from '../../domain/entities/whatsapp-connection.entity';
import { ActiveConversationAlreadyExistsError } from '../../domain/errors/whatsapp.errors';
import type { ConversationRepository } from '../../domain/repositories/conversation.repository';
import type { MessageRepository } from '../../domain/repositories/message.repository';
import type { ProcessedMessageRepository } from '../../domain/repositories/processed-message.repository';
import type { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import type { Barrier } from './async-helpers';

/**
 * Implementaciones in-memory de los puertos de persistencia. Respetan el contrato del puerto Y los
 * índices únicos reales de la BD, con el mismo tipo de fallo que produce Postgres (SQLSTATE 23505).
 * Devuelven copias (como una lectura a la BD): mutar una entidad leída no cambia lo almacenado hasta
 * llamar a `save`.
 *
 * Fuente de los índices (schema_snapshot.sql es la fotografía del esquema real):
 *  - conexiones_whatsapp.negocio_id UNIQUE ........ supabase/migrations/20260925120000_create_conexiones_whatsapp.sql:4
 *  - conexiones_whatsapp.numero_whatsapp UNIQUE ... supabase/migrations/20260925120000_create_conexiones_whatsapp.sql:5
 *  - conexiones_whatsapp.phone_number_id UNIQUE ... supabase/migrations/20261029130000_migrate_whatsapp_to_meta_cloud_api.sql:27-28
 *  - uq_conversaciones_activa (parcial, estado='activa') ... supabase/migrations/20261022120000_conversaciones_unico_activo_parcial.sql:20-22
 *  - mensajes.id_mensaje_proveedor UNIQUE ......... GAP: la migración 20261029130000_migrate_whatsapp_to_meta_cloud_api.sql:42-43 solo
 *    RENOMBRA el constraint; su creación (y la de las tablas mensajes/conversaciones) no está versionada en
 *    supabase/migrations, solo en supabase/schema_snapshot.sql:505.
 */
export class UniqueViolationError extends Error {
  /** SQLSTATE unique_violation, igual que el error que devuelve PostgREST. */
  readonly code = '23505';

  constructor(readonly constraint: string) {
    super(`duplicate key value violates unique constraint "${constraint}"`);
    this.name = 'UniqueViolationError';
  }
}

type Barriers<K extends string> = Partial<Record<K, Barrier>>;

function cloneConnection(source: WhatsappConnection): WhatsappConnection {
  return WhatsappConnection.create({
    id: source.id,
    businessId: source.businessId,
    phoneNumberId: source.phoneNumberId,
    wabaId: source.wabaId,
    phoneNumber: source.phoneNumber,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  });
}

function cloneConversation(source: Conversation): Conversation {
  return Conversation.create({
    id: source.id,
    businessId: source.businessId,
    customerNumber: source.customerNumber,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  });
}

function cloneMessage(source: Message): Message {
  return Message.create({
    id: source.id,
    conversationId: source.conversationId,
    sender: source.sender,
    content: source.content,
    providerMessageId: source.providerMessageId,
    deliveryStatus: source.deliveryStatus,
    createdAt: source.createdAt,
  });
}

export class InMemoryWhatsappConnectionRepository implements WhatsappConnectionRepository {
  private readonly rows = new Map<string, WhatsappConnection>();

  async findByBusinessId(businessId: string): Promise<WhatsappConnection | null> {
    const found = [...this.rows.values()].find((row) => row.businessId === businessId);
    return found ? cloneConnection(found) : null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<WhatsappConnection | null> {
    const found = [...this.rows.values()].find((row) => row.phoneNumber === phoneNumber);
    return found ? cloneConnection(found) : null;
  }

  async findByPhoneNumberId(phoneNumberId: string): Promise<WhatsappConnection | null> {
    const found = [...this.rows.values()].find((row) => row.phoneNumberId === phoneNumberId);
    return found ? cloneConnection(found) : null;
  }

  /** Upsert por negocio (`onConflict: 'negocio_id'`, como el repositorio de Supabase). */
  async save(connection: WhatsappConnection): Promise<void> {
    const existing = [...this.rows.values()].find((row) => row.businessId === connection.businessId);

    for (const other of this.rows.values()) {
      if (other.businessId === connection.businessId) {
        continue;
      }

      if (other.phoneNumberId === connection.phoneNumberId) {
        throw new UniqueViolationError('conexiones_whatsapp_phone_number_id_key');
      }

      if (connection.phoneNumber !== null && other.phoneNumber === connection.phoneNumber) {
        throw new UniqueViolationError('conexiones_whatsapp_numero_whatsapp_key');
      }
    }

    this.rows.set(existing?.id ?? connection.id, cloneConnection(connection));
  }

  all(): WhatsappConnection[] {
    return [...this.rows.values()].map(cloneConnection);
  }
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly rows = new Map<string, Conversation>();

  /** Barreras opcionales para forzar carreras deterministas en las pruebas. */
  readonly barriers: Barriers<'findActiveByBusinessAndCustomer'> = {};

  async findById(id: string): Promise<Conversation | null> {
    const found = this.rows.get(id);
    return found ? cloneConversation(found) : null;
  }

  async findActiveByBusinessAndCustomer(
    businessId: string,
    customerNumber: string,
  ): Promise<Conversation | null> {
    const found = [...this.rows.values()].find(
      (row) =>
        row.businessId === businessId &&
        row.customerNumber === customerNumber &&
        row.status === ConversationStatus.ACTIVE,
    );
    const snapshot = found ? cloneConversation(found) : null;

    // La barrera va DESPUÉS de leer: todas las llamadas concurrentes ya vieron el mismo estado.
    await this.barriers.findActiveByBusinessAndCustomer?.wait();

    return snapshot;
  }

  /** Upsert por id + índice único parcial uq_conversaciones_activa. */
  async save(conversation: Conversation): Promise<void> {
    if (conversation.status === ConversationStatus.ACTIVE) {
      const clash = [...this.rows.values()].find(
        (row) =>
          row.id !== conversation.id &&
          row.businessId === conversation.businessId &&
          row.customerNumber === conversation.customerNumber &&
          row.status === ConversationStatus.ACTIVE,
      );

      if (clash) {
        // El repositorio real traduce este 23505 a ActiveConversationAlreadyExistsError.
        throw new ActiveConversationAlreadyExistsError();
      }
    }

    this.rows.set(conversation.id, cloneConversation(conversation));
  }

  all(): Conversation[] {
    return [...this.rows.values()].map(cloneConversation);
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  private readonly rows = new Map<string, Message>();

  async save(message: Message): Promise<void> {
    if (message.providerMessageId !== null) {
      const clash = [...this.rows.values()].find(
        (row) => row.id !== message.id && row.providerMessageId === message.providerMessageId,
      );

      if (clash) {
        throw new UniqueViolationError('mensajes_id_mensaje_proveedor_key');
      }
    }

    this.rows.set(message.id, cloneMessage(message));
  }

  async findByProviderMessageId(providerMessageId: string): Promise<Message | null> {
    const found = [...this.rows.values()].find((row) => row.providerMessageId === providerMessageId);
    return found ? cloneMessage(found) : null;
  }

  async findLastMessageDate(conversationId: string): Promise<Date | null> {
    const times = [...this.rows.values()]
      .filter((row) => row.conversationId === conversationId)
      .map((row) => row.createdAt.getTime());

    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }

  all(): Message[] {
    return [...this.rows.values()].map(cloneMessage);
  }

  byConversation(conversationId: string): Message[] {
    return this.all()
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

/** Igual que el repositorio de Supabase: la deduplicación consulta la tabla de mensajes. */
export class InMemoryProcessedMessageRepository implements ProcessedMessageRepository {
  readonly barriers: Barriers<'existsByProviderMessageId'> = {};

  constructor(private readonly messages: InMemoryMessageRepository) {}

  async existsByProviderMessageId(providerMessageId: string): Promise<boolean> {
    const exists = (await this.messages.findByProviderMessageId(providerMessageId)) !== null;

    // La barrera va DESPUÉS de leer: todas las llamadas concurrentes ya vieron el mismo estado.
    await this.barriers.existsByProviderMessageId?.wait();

    return exists;
  }
}
