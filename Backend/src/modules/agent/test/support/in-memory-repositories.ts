import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { BusinessNotFoundError } from '../../domain/errors/agent.errors';
import { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import {
  BusinessAttentionRepository,
  BusinessAttentionStatus,
} from '../../domain/repositories/business-attention.repository';
import {
  CatalogItem,
  CatalogRepository,
  MAX_CATALOG_ITEMS,
} from '../../domain/repositories/catalog.repository';
import {
  ConversationHistoryRepository,
  HistoryMessage,
  HistorySender,
} from '../../domain/repositories/conversation-history.repository';

/**
 * Repositorio en memoria para la configuración del agente.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 475: CONSTRAINT "configuracion_agente_negocio_id_key" UNIQUE ("negocio_id")
 * - Respalda: schema_snapshot.sql línea 260-261:
 *     CONSTRAINT "chk_estilo_regional" CHECK ((estilo_regional IS NULL) OR (estilo_regional = ANY (ARRAY['NEUTRO', 'PAISA', 'COSTENO', 'CALENO', 'BOGOTANO'])))
 *     CONSTRAINT "chk_tono" CHECK ((tono IS NULL) OR (tono = ANY (ARRAY['FORMAL', 'AMABLE', 'ENTUSIASTA', 'SEGURO', 'CERCANO'])))
 */
export class InMemoryAgentConfigRepository implements AgentConfigRepository {
  private readonly configsByBusinessId = new Map<string, AgentConfig>();

  async findByBusinessId(businessId: string): Promise<AgentConfig | null> {
    const config = this.configsByBusinessId.get(businessId);
    if (!config) {
      return null;
    }
    // Devolvemos una copia para evitar mutaciones externas involuntarias fuera de save()
    return AgentConfig.create({
      id: config.id,
      businessId: config.businessId,
      personality: config.personality,
      tone: config.tone,
      regionalStyle: config.regionalStyle,
      welcomeMessage: config.welcomeMessage,
      unavailableMessage: config.unavailableMessage,
      businessHours: config.businessHours ? { ...config.businessHours } : null,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  }

  async save(config: AgentConfig): Promise<void> {
    // Verificación de restricciones CHECK
    if (config.tone !== null && !Object.values(AgentTone).includes(config.tone)) {
      throw new Error(`chk_tono violation: valor "${config.tone}" no permitido`);
    }
    if (config.regionalStyle !== null && !Object.values(AgentRegionalStyle).includes(config.regionalStyle)) {
      throw new Error(`chk_estilo_regional violation: valor "${config.regionalStyle}" no permitido`);
    }

    // Persistencia fiel al UNIQUE(negocio_id) con upsert
    this.configsByBusinessId.set(
      config.businessId,
      AgentConfig.create({
        id: config.id,
        businessId: config.businessId,
        personality: config.personality,
        tone: config.tone,
        regionalStyle: config.regionalStyle,
        welcomeMessage: config.welcomeMessage,
        unavailableMessage: config.unavailableMessage,
        businessHours: config.businessHours ? { ...config.businessHours } : null,
        createdAt: config.createdAt,
        updatedAt: new Date(),
      }),
    );
  }

  // Helper para pruebas
  seed(config: AgentConfig): void {
    this.configsByBusinessId.set(config.businessId, config);
  }

  clear(): void {
    this.configsByBusinessId.clear();
  }
}

/**
 * Repositorio en memoria del estado de atención del negocio.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 336: TABLA "negocios"
 *     (nombre_negocio, atencion_automatica_activa, estado, deleted_at)
 * - Respalda: schema_snapshot.sql línea 347: CONSTRAINT "negocios_estado_check" CHECK (estado IN ('activo', 'inactivo', 'suspendido'))
 */
export class InMemoryBusinessAttentionRepository implements BusinessAttentionRepository {
  private readonly businesses = new Map<string, BusinessAttentionStatus>();

  async getStatus(businessId: string): Promise<BusinessAttentionStatus> {
    const status = this.businesses.get(businessId);
    if (!status) {
      throw new BusinessNotFoundError(businessId);
    }
    return { ...status };
  }

  seed(businessId: string, status: BusinessAttentionStatus): void {
    this.businesses.set(businessId, status);
  }

  clear(): void {
    this.businesses.clear();
  }
}

/**
 * Repositorio en memoria del catálogo de productos para el agente.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 216: CONSTRAINT "catalogo_productos_precio_check" CHECK (precio >= 0)
 * - Respalda: schema_snapshot.sql línea 626: CREATE UNIQUE INDEX "uq_productos_negocio_nombre_activo"
 *     ON "catalogo_productos" ("negocio_id", lower("nombre")) WHERE ("deleted_at" IS NULL)
 */
export class InMemoryCatalogRepository implements CatalogRepository {
  private readonly itemsByBusiness = new Map<string, CatalogItem[]>();

  async findByBusinessId(businessId: string): Promise<CatalogItem[]> {
    const items = this.itemsByBusiness.get(businessId) ?? [];

    // Ordenamiento fiel: disponibles primero, luego por categoría, nombre e id
    const sorted = [...items].sort(compareCatalogItems);

    // Truncado fiel a MAX_CATALOG_ITEMS (50)
    return sorted.slice(0, MAX_CATALOG_ITEMS);
  }

  seed(businessId: string, items: CatalogItem[]): void {
    // Validar restricción de precio >= 0
    for (const item of items) {
      if (item.price < 0) {
        throw new Error(`catalogo_productos_precio_check: precio no puede ser negativo (${item.price})`);
      }
    }

    // Validar unicidad parcial negocio_id + lower(nombre)
    const seenNames = new Set<string>();
    for (const item of items) {
      const lower = item.name.toLowerCase();
      if (seenNames.has(lower)) {
        throw new Error(`uq_productos_negocio_nombre_activo: producto duplicado "${item.name}"`);
      }
      seenNames.add(lower);
    }

    this.itemsByBusiness.set(businessId, [...items]);
  }

  clear(): void {
    this.itemsByBusiness.clear();
  }
}

function compareCatalogItems(a: CatalogItem, b: CatalogItem): number {
  if (a.available !== b.available) {
    return a.available ? -1 : 1;
  }
  if (a.categoryName !== b.categoryName) {
    if (a.categoryName === null) return 1;
    if (b.categoryName === null) return -1;
    return a.categoryName.localeCompare(b.categoryName, 'es');
  }
  return a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  sender: 'cliente' | 'agente_ia' | 'sistema';
  content: string;
  providerMessageId?: string | null;
  deliveryStatus?: 'enviado' | 'fallido' | 'pendiente' | null;
  createdAt: Date;
}

/**
 * Repositorio en memoria del historial de conversaciones.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 505: CONSTRAINT "mensajes_id_mensaje_proveedor_key" UNIQUE ("id_mensaje_proveedor")
 * - Respalda: schema_snapshot.sql línea 586: CREATE INDEX "idx_mensajes_conversacion_created" ON "mensajes" ("conversacion_id", "created_at")
 * - Respalda: schema_snapshot.sql línea 328-329:
 *     CONSTRAINT "mensajes_estado_envio_check" CHECK (estado_envio IN ('enviado', 'fallido', 'pendiente') OR estado_envio IS NULL)
 *     CONSTRAINT "mensajes_remitente_check" CHECK (remitente IN ('cliente', 'agente_ia', 'sistema'))
 */
export class InMemoryConversationHistoryRepository implements ConversationHistoryRepository {
  private messages: StoredMessage[] = [];

  async countByConversationId(conversationId: string): Promise<number> {
    return this.messages.filter((m) => m.conversationId === conversationId).length;
  }

  async findRecentByConversationId(
    conversationId: string,
    limit: number,
    excludeMessageId: string,
  ): Promise<HistoryMessage[]> {
    // Filtro fiel: solo mensajes de 'cliente' o 'agente_ia', excluyendo id actual y envíos fallidos
    const filtered = this.messages.filter(
      (m) =>
        m.conversationId === conversationId &&
        m.id !== excludeMessageId &&
        (m.sender === 'cliente' || m.sender === 'agente_ia') &&
        m.deliveryStatus !== 'fallido',
    );

    // Ordenamiento fiel: created_at desc, id desc
    const sorted = [...filtered].sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    const page = sorted.slice(0, limit);

    // Se revierte a orden cronológico (antiguo a reciente) como hace la consulta real
    return page.reverse().map((m) => ({
      sender: (m.sender === 'cliente' ? 'CUSTOMER' : 'AGENT') as HistorySender,
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  seedMessage(message: StoredMessage): void {
    if (message.providerMessageId) {
      const duplicate = this.messages.some((m) => m.providerMessageId === message.providerMessageId);
      if (duplicate) {
        throw new Error(
          `mensajes_id_mensaje_proveedor_key: id_mensaje_proveedor duplicado "${message.providerMessageId}"`,
        );
      }
    }
    this.messages.push(message);
  }

  clear(): void {
    this.messages = [];
  }
}
