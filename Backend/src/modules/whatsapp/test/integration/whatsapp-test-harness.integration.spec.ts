import { jest } from '@jest/globals';
import fs from 'node:fs';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { WhatsappConnection, WhatsappConnectionStatus } from '../../domain/entities/whatsapp-connection.entity';
import { ActiveConversationAlreadyExistsError } from '../../domain/errors/whatsapp.errors';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemoryWhatsappConnectionRepository,
  UniqueViolationError,
} from '../support/in-memory-repositories';
import { createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

/**
 * Pruebas del propio andamiaje: si los fakes no respetan los índices únicos reales, el resto de la
 * suite probaría un sistema que no existe.
 */
describe('Andamiaje de integración de WhatsApp', () => {
  describe('aislamiento del entorno', () => {
    it('levantar el módulo no lee ningún archivo .env ni usa process.env', async () => {
      const readSpy = jest.spyOn(fs, 'readFileSync');
      process.env.WHATSAPP_APP_SECRET = 'secreto-del-proceso-que-no-debe-usarse';

      try {
        const testApp = await createWhatsappTestApp();

        try {
          const envReads = readSpy.mock.calls
            .map(([path]) => String(path))
            .filter((path) => /(^|[\\/])\.env(\.|$)/.test(path));

          expect(envReads).toEqual([]);
          // La firma se valida con el secreto del stub, no con el del proceso.
          const response = await testApp.postWebhook({}).expect(200);
          expect(response.status).toBe(200);
        } finally {
          await testApp.close();
        }
      } finally {
        delete process.env.WHATSAPP_APP_SECRET;
        readSpy.mockRestore();
      }
    });

    describe('con la app levantada', () => {
      let testApp: WhatsappTestApp;

      beforeEach(async () => {
        testApp = await createWhatsappTestApp();
      });

      afterEach(async () => {
        // Las llamadas inesperadas se verifican en el test; aquí se limpia el registro para que close() no falle.
        testApp.graph.unexpected.length = 0;
        await testApp.close();
      });

      it('fetch a una URL no declarada rechaza y queda registrado (nunca sale a la red)', async () => {
        await expect(fetch('https://example.com/cualquier-cosa')).rejects.toThrow(/fetch inesperado/);

        expect(testApp.graph.unexpected).toEqual(['https://example.com/cualquier-cosa']);
        expect(() => testApp.graph.assertNoUnexpectedCalls()).toThrow(/example\.com/);
      });

      it('Supabase real queda inutilizado: cualquier uso lanza', async () => {
        const supabase = testApp.app.get(SupabaseService, { strict: false });

        expect(() => supabase.getClient()).toThrow(/no está disponible/);
      });

      it('el estado arranca vacío en cada prueba', () => {
        expect(testApp.connections.all()).toEqual([]);
        expect(testApp.conversations.all()).toEqual([]);
        expect(testApp.messages.all()).toEqual([]);
        expect(testApp.agent.calls).toEqual([]);
      });
    });
  });

  describe('contrato de los repositorios in-memory', () => {
    const connection = (businessId: string, phoneNumberId: string, phoneNumber: string | null = null) =>
      WhatsappConnection.create({
        id: `conn-${businessId}`,
        businessId,
        phoneNumberId,
        wabaId: 'waba',
        phoneNumber,
        status: WhatsappConnectionStatus.CONNECTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    it('conexiones: phone_number_id único entre negocios (conexiones_whatsapp_phone_number_id_key)', async () => {
      const repo = new InMemoryWhatsappConnectionRepository();
      await repo.save(connection('negocio-1', 'PN-1'));

      await expect(repo.save(connection('negocio-2', 'PN-1'))).rejects.toMatchObject({
        code: '23505',
        constraint: 'conexiones_whatsapp_phone_number_id_key',
      });
    });

    it('conexiones: número visible único, pero los NULL no chocan (conexiones_whatsapp_numero_whatsapp_key)', async () => {
      const repo = new InMemoryWhatsappConnectionRepository();
      await repo.save(connection('negocio-1', 'PN-1', '15550000001'));
      await repo.save(connection('negocio-2', 'PN-2', null));
      await repo.save(connection('negocio-3', 'PN-3', null));

      await expect(repo.save(connection('negocio-4', 'PN-4', '15550000001'))).rejects.toBeInstanceOf(
        UniqueViolationError,
      );
    });

    it('conexiones: un negocio solo tiene una conexión (upsert por negocio_id)', async () => {
      const repo = new InMemoryWhatsappConnectionRepository();
      await repo.save(connection('negocio-1', 'PN-1'));
      await repo.save(connection('negocio-1', 'PN-9'));

      expect(repo.all()).toHaveLength(1);
      expect((await repo.findByBusinessId('negocio-1'))?.phoneNumberId).toBe('PN-9');
      expect(await repo.findByPhoneNumberId('PN-1')).toBeNull();
    });

    it('conversaciones: solo UNA activa por negocio+cliente, pero varias cerradas (uq_conversaciones_activa)', async () => {
      const repo = new InMemoryConversationRepository();
      const first = Conversation.start({ businessId: 'negocio-1', customerNumber: '573001111111' });
      await repo.save(first);

      await expect(
        repo.save(Conversation.start({ businessId: 'negocio-1', customerNumber: '573001111111' })),
      ).rejects.toBeInstanceOf(ActiveConversationAlreadyExistsError);

      // Otro cliente u otro negocio no chocan.
      await repo.save(Conversation.start({ businessId: 'negocio-1', customerNumber: '573002222222' }));
      await repo.save(Conversation.start({ businessId: 'negocio-2', customerNumber: '573001111111' }));

      // Cerrar libera el índice parcial, y se pueden acumular cerradas.
      const stored = (await repo.findById(first.id)) as Conversation;
      stored.close();
      await repo.save(stored);
      const second = Conversation.start({ businessId: 'negocio-1', customerNumber: '573001111111' });
      await repo.save(second);
      second.close();
      await repo.save(second);
      await repo.save(Conversation.start({ businessId: 'negocio-1', customerNumber: '573001111111' }));

      const closed = repo.all().filter((c) => c.status === ConversationStatus.CLOSED);
      expect(closed).toHaveLength(2);
    });

    it('mensajes: id_mensaje_proveedor único (mensajes_id_mensaje_proveedor_key); varios NULL permitidos', async () => {
      const repo = new InMemoryMessageRepository();
      await repo.save(Message.receiveFromCustomer({ conversationId: 'c1', content: 'a', providerMessageId: 'wamid.1' }));

      await expect(
        repo.save(Message.receiveFromCustomer({ conversationId: 'c1', content: 'b', providerMessageId: 'wamid.1' })),
      ).rejects.toMatchObject({ code: '23505', constraint: 'mensajes_id_mensaje_proveedor_key' });

      await repo.save(Message.sentByAgent({ conversationId: 'c1', content: 'x', providerMessageId: null, deliveryStatus: 'failed' }));
      await repo.save(Message.sentByAgent({ conversationId: 'c1', content: 'y', providerMessageId: null, deliveryStatus: 'failed' }));
      expect(repo.all()).toHaveLength(3);
    });

    it('las lecturas devuelven copias: mutar una entidad no cambia lo almacenado hasta guardarla', async () => {
      const repo = new InMemoryMessageRepository();
      const original = Message.sentByAgent({ conversationId: 'c1', content: 'x', providerMessageId: 'wamid.1', deliveryStatus: 'pending' });
      await repo.save(original);

      const read = (await repo.findByProviderMessageId('wamid.1')) as Message;
      read.updateDeliveryStatus('sent');

      expect((await repo.findByProviderMessageId('wamid.1'))?.deliveryStatus).toBe('pending');

      await repo.save(read);
      expect((await repo.findByProviderMessageId('wamid.1'))?.deliveryStatus).toBe('sent');
    });
  });
});
