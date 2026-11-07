import { jest } from '@jest/globals';
import { MessageMapper } from './message.mapper';
import { WhatsappConnectionMapper } from './whatsapp-connection.mapper';
import { SupabaseMessageRepository } from './supabase-message.repository';
import { SupabaseProcessedMessageRepository } from './supabase-processed-message.repository';
import { SupabaseWhatsappConnectionRepository } from './supabase-whatsapp-connection.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { Message } from '../../domain/entities/message.entity';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';

type AnyFn = (...args: any[]) => any;

describe('mappers de persistencia de whatsapp (esquema Meta)', () => {
  it('MessageMapper traduce providerMessageId <-> id_mensaje_proveedor', () => {
    const message = Message.sentByAgent({
      conversationId: 'conversation-1',
      content: 'Hola',
      providerMessageId: 'wamid.123',
      deliveryStatus: 'sent',
    });

    const row = MessageMapper.toPersistence(message);

    expect(row).toMatchObject({ id_mensaje_proveedor: 'wamid.123', estado_envio: 'enviado' });
    expect(row).not.toHaveProperty('twilio_message_sid');
    expect(MessageMapper.toDomain({ ...row, created_at: '2026-10-29T10:00:00.000Z' }).providerMessageId).toBe(
      'wamid.123',
    );
  });

  it('WhatsappConnectionMapper traduce phone_number_id, waba_id y numero_whatsapp (nullable)', () => {
    const connection = WhatsappConnection.create({
      id: 'connection-1',
      businessId: 'business-1',
      phoneNumberId: '106540352242922',
      wabaId: '102290129340398',
      phoneNumber: null,
      status: WhatsappConnectionStatus.FAILED,
      createdAt: new Date('2026-10-29T10:00:00.000Z'),
      updatedAt: new Date('2026-10-29T10:00:00.000Z'),
    });

    const row = WhatsappConnectionMapper.toPersistence(connection);

    expect(row).toMatchObject({
      negocio_id: 'business-1',
      phone_number_id: '106540352242922',
      waba_id: '102290129340398',
      numero_whatsapp: null,
      estado: 'fallido',
    });
    expect(Object.keys(row).some((key) => key.startsWith('twilio'))).toBe(false);

    const roundTrip = WhatsappConnectionMapper.toDomain({ ...row, created_at: '2026-10-29T10:00:00.000Z' });
    expect(roundTrip.phoneNumberId).toBe('106540352242922');
    expect(roundTrip.wabaId).toBe('102290129340398');
    expect(roundTrip.phoneNumber).toBeNull();
    expect(roundTrip.status).toBe(WhatsappConnectionStatus.FAILED);
  });
});

describe('repositorios de whatsapp: columnas del esquema Meta', () => {
  let chain: Record<string, jest.Mock<AnyFn>>;
  let from: jest.Mock<AnyFn>;
  const supabase = () => ({ getClient: () => ({ from }) }) as unknown as SupabaseService;

  beforeEach(() => {
    chain = {};
    for (const method of ['select', 'eq']) {
      chain[method] = jest.fn<AnyFn>().mockReturnValue(chain);
    }
    chain.maybeSingle = jest.fn<AnyFn>().mockResolvedValue({ data: null, error: null });
    from = jest.fn<AnyFn>().mockReturnValue(chain);
  });

  it('conexión: findByPhoneNumberId filtra por phone_number_id', async () => {
    await new SupabaseWhatsappConnectionRepository(supabase()).findByPhoneNumberId('106540352242922');

    expect(from).toHaveBeenCalledWith('conexiones_whatsapp');
    expect(chain.eq).toHaveBeenCalledWith('phone_number_id', '106540352242922');
  });

  it('mensajes: findByProviderMessageId filtra por id_mensaje_proveedor', async () => {
    await new SupabaseMessageRepository(supabase()).findByProviderMessageId('wamid.123');

    expect(from).toHaveBeenCalledWith('mensajes');
    expect(chain.eq).toHaveBeenCalledWith('id_mensaje_proveedor', 'wamid.123');
  });

  it('mensajes procesados: la deduplicación cuenta por id_mensaje_proveedor', async () => {
    chain.eq.mockResolvedValue({ count: 1, error: null });

    const exists = await new SupabaseProcessedMessageRepository(supabase()).existsByProviderMessageId('wamid.123');

    expect(exists).toBe(true);
    expect(chain.eq).toHaveBeenCalledWith('id_mensaje_proveedor', 'wamid.123');
  });
});
