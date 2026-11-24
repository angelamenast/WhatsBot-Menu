import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { CatalogItem } from '../../domain/repositories/catalog.repository';
import { ProcessCustomerMessageCommand } from '../../application/dto/process-customer-message.command';
import { StoredMessage } from './in-memory-repositories';

export class AgentTestDataBuilder {
  static aCommand(overrides: Partial<ProcessCustomerMessageCommand> = {}): ProcessCustomerMessageCommand {
    return {
      businessId: overrides.businessId ?? 'business-test-1',
      conversationId: overrides.conversationId ?? 'conversation-test-1',
      messageId: overrides.messageId ?? 'msg-incoming-1',
      customerNumber: overrides.customerNumber ?? '+573001234567',
      message: overrides.message ?? 'Hola, deseo ver el menú por favor',
    };
  }

  static anAgentConfig(overrides: Partial<Parameters<typeof AgentConfig.create>[0]> = {}): AgentConfig {
    const businessId = overrides.businessId ?? 'business-test-1';
    return AgentConfig.create({
      id: overrides.id ?? `config-${businessId}`,
      businessId,
      personality: overrides.personality ?? 'Atento y servicial',
      tone: overrides.tone ?? AgentTone.AMABLE,
      regionalStyle: overrides.regionalStyle ?? AgentRegionalStyle.PAISA,
      welcomeMessage: overrides.welcomeMessage ?? '¡Hola! Te damos la bienvenida a nuestro restaurante.',
      unavailableMessage: overrides.unavailableMessage ?? 'En este momento no nos encontramos disponibles.',
      businessHours: overrides.businessHours ?? { lunes: '8am - 8pm' },
      createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
      updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
    });
  }

  static aCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
    return {
      id: overrides.id ?? `prod-${Math.random().toString(36).substring(2, 7)}`,
      name: overrides.name ?? 'Hamburguesa Artesanal',
      description: overrides.description ?? 'Deliciosa carne con queso y papas',
      price: overrides.price ?? 22000,
      available: overrides.available ?? true,
      categoryName: overrides.categoryName ?? 'Comidas Rápidas',
    };
  }

  static aStoredMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
    return {
      id: overrides.id ?? `msg-${Math.random().toString(36).substring(2, 7)}`,
      conversationId: overrides.conversationId ?? 'conversation-test-1',
      sender: overrides.sender ?? 'cliente',
      content: overrides.content ?? 'Hola buenas tardes',
      providerMessageId: overrides.providerMessageId ?? `wam-${Math.random().toString(36).substring(2, 10)}`,
      deliveryStatus: overrides.deliveryStatus ?? null,
      createdAt: overrides.createdAt ?? new Date(),
    };
  }
}
