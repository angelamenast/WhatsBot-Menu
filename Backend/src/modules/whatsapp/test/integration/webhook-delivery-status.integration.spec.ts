import { jest } from '@jest/globals';
import { MessageSender } from '../../domain/entities/message.entity';
import { messagesChange, statusPayload, textPayload, webhookPayload } from '../support/meta-payloads';
import { createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

/**
 * Los estados de la Graph API (sent/delivered/read/failed) se reducen al dominio, que solo conoce
 * 'sent' | 'failed' | 'pending' (handle-status-callback.use-case.ts:7-15). "delivered" y "read"
 * equivalen a "sent"; "failed" es terminal.
 */
describe('POST /api/whatsapp/webhook (estados de entrega)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
    await testApp.seedBusiness();
  });

  afterEach(async () => {
    await testApp.close();
  });

  /** Recibe un mensaje del cliente: el agente responde y la respuesta queda con wamid `wamid.OUT.n`. */
  const exchange = async (incomingId: string) => {
    await testApp.postWebhook(textPayload({ id: incomingId })).expect(200);
    await testApp.settle();
  };

  const deliveryOf = (wamid: string) => testApp.messages.all().find((m) => m.providerMessageId === wamid)?.deliveryStatus;

  const sendStatus = async (...statuses: { id: string; status: string; errors?: Record<string, unknown>[] }[]) => {
    await testApp.postWebhook(statusPayload(statuses)).expect(200);
    await testApp.settle();
  };

  it.each(['sent', 'delivered', 'read'])('"%s" sobre un mensaje enviado: sigue "sent" y no se reescribe', async (status) => {
    await exchange('wamid.IN.1');
    const saveSpy = jest.spyOn(testApp.messages, 'save');

    await sendStatus({ id: 'wamid.OUT.1', status });

    expect(deliveryOf('wamid.OUT.1')).toBe('sent');
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it.each(['sent', 'delivered', 'read'])('"%s" sobre un mensaje pendiente: pasa a "sent"', async (status) => {
    testApp.messaging.respondWith({ providerMessageId: 'wamid.OUT.P', status: 'pending' });
    await exchange('wamid.IN.1');
    expect(deliveryOf('wamid.OUT.P')).toBe('pending');

    await sendStatus({ id: 'wamid.OUT.P', status });

    expect(deliveryOf('wamid.OUT.P')).toBe('sent');
  });

  describe('failed', () => {
    it('marca el mensaje como "failed" y registra code y message del error sin datos del cliente', async () => {
      await exchange('wamid.IN.1');

      await sendStatus({
        id: 'wamid.OUT.1',
        status: 'failed',
        errors: [{ code: 131047, title: 'Re-engagement message', message: 'Han pasado más de 24 h' }],
      });

      expect(deliveryOf('wamid.OUT.1')).toBe('failed');
      const warnings = testApp.logs.warn.join('\n');
      expect(warnings).toContain('wamid.OUT.1');
      expect(warnings).toContain('code=131047');
      expect(warnings).toContain('Han pasado más de 24 h');
      expect(warnings).not.toContain('573001111111');
    });

    it('sin detalle de error: se marca "failed" y el log indica que no hay código', async () => {
      await exchange('wamid.IN.1');

      await sendStatus({ id: 'wamid.OUT.1', status: 'failed' });

      expect(deliveryOf('wamid.OUT.1')).toBe('failed');
      expect(testApp.logs.warn.join('\n')).toContain('code=desconocido');
    });

    it('es terminal: un "sent", "delivered" o "read" tardío (desordenado) no lo revierte', async () => {
      await exchange('wamid.IN.1');
      await sendStatus({ id: 'wamid.OUT.1', status: 'failed' });

      await sendStatus({ id: 'wamid.OUT.1', status: 'sent' });
      await sendStatus({ id: 'wamid.OUT.1', status: 'delivered' });
      await sendStatus({ id: 'wamid.OUT.1', status: 'read' });

      expect(deliveryOf('wamid.OUT.1')).toBe('failed');
    });

    it('un "failed" posterior a "delivered"/"read" sí lo marca como fallido', async () => {
      await exchange('wamid.IN.1');
      await sendStatus({ id: 'wamid.OUT.1', status: 'read' });

      await sendStatus({ id: 'wamid.OUT.1', status: 'failed' });

      expect(deliveryOf('wamid.OUT.1')).toBe('failed');
    });
  });

  it('varios estados en un POST se aplican en orden de llegada (el último "failed" gana, sin revertirse)', async () => {
    await exchange('wamid.IN.1');

    await sendStatus(
      { id: 'wamid.OUT.1', status: 'delivered' },
      { id: 'wamid.OUT.1', status: 'failed' },
      { id: 'wamid.OUT.1', status: 'read' },
    );

    expect(deliveryOf('wamid.OUT.1')).toBe('failed');
  });

  it('actualiza solo el mensaje cuyo wamid llega, no otros de la misma conversación', async () => {
    await exchange('wamid.IN.1');
    await exchange('wamid.IN.2');
    expect(testApp.messages.all().filter((m) => m.sender === MessageSender.AGENT)).toHaveLength(2);

    await sendStatus({ id: 'wamid.OUT.2', status: 'failed' });

    expect(deliveryOf('wamid.OUT.1')).toBe('sent');
    expect(deliveryOf('wamid.OUT.2')).toBe('failed');
  });

  describe('estados o mensajes que no se pueden aplicar', () => {
    it('wamid desconocido: 200, aviso en el log y nada cambia', async () => {
      await exchange('wamid.IN.1');

      await sendStatus({ id: 'wamid.NO-EXISTE', status: 'failed' });

      expect(deliveryOf('wamid.OUT.1')).toBe('sent');
      expect(testApp.logs.warn.join('\n')).toContain('No se encontró ningún mensaje con providerMessageId=wamid.NO-EXISTE');
      expect(testApp.logs.error).toEqual([]);
    });

    it.each(['deleted', 'warning', 'played', 'FAILED', ''])(
      'estado desconocido "%s": el parser lo descarta y el mensaje no cambia',
      async (status) => {
        await exchange('wamid.IN.1');
        const saveSpy = jest.spyOn(testApp.messages, 'save');

        await sendStatus({ id: 'wamid.OUT.1', status });

        expect(deliveryOf('wamid.OUT.1')).toBe('sent');
        expect(saveSpy).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['sin id', { status: 'failed' }],
      ['id numérico', { id: 123, status: 'failed' }],
      ['sin status', { id: 'wamid.OUT.1' }],
    ])('estado malformado (%s): se ignora', async (_label, raw) => {
      await exchange('wamid.IN.1');

      await testApp.postWebhook(webhookPayload(messagesChange({ statuses: [raw] }))).expect(200);
      await testApp.settle();

      expect(deliveryOf('wamid.OUT.1')).toBe('sent');
    });

    it('un envío que falló antes de llegar a Meta (sin wamid) no puede recibir estados', async () => {
      testApp.messaging.failWith(new Error('sin red'));
      await exchange('wamid.IN.1');

      await sendStatus({ id: 'wamid.OUT.1', status: 'delivered' });

      const reply = testApp.messages.all().find((m) => m.sender === MessageSender.AGENT);
      expect(reply).toMatchObject({ providerMessageId: null, deliveryStatus: 'failed' });
    });
  });

  describe('observaciones del comportamiento actual', () => {
    it('el estado no se valida contra el negocio: se aplica aunque metadata.phone_number_id sea desconocido', async () => {
      await exchange('wamid.IN.1');

      await testApp.postWebhook(statusPayload([{ id: 'wamid.OUT.1', status: 'failed' }], '999999999999999')).expect(200);
      await testApp.settle();

      // handle-status-callback.use-case.ts:35 busca solo por wamid; el parser ignora el phone_number_id de los estados.
      expect(deliveryOf('wamid.OUT.1')).toBe('failed');
    });

    it('un estado cuyo wamid es de un mensaje ENTRANTE (Meta no lo envía) le asigna delivery "sent" al mensaje del cliente', async () => {
      await exchange('wamid.IN.1');
      expect(deliveryOf('wamid.IN.1')).toBeNull();

      await sendStatus({ id: 'wamid.IN.1', status: 'delivered' });

      // El use case no filtra por remitente (handle-status-callback.use-case.ts:35-62).
      expect(deliveryOf('wamid.IN.1')).toBe('sent');
    });
  });

  it('un POST de estados sin firma válida se rechaza (401) y no modifica nada', async () => {
    await exchange('wamid.IN.1');

    await testApp.postWebhook(statusPayload([{ id: 'wamid.OUT.1', status: 'failed' }]), 'sha256=00').expect(401);
    await testApp.settle();

    expect(deliveryOf('wamid.OUT.1')).toBe('sent');
  });

  it('un estado no dispara al agente ni abre conversaciones', async () => {
    await sendStatus({ id: 'wamid.X', status: 'delivered' });

    expect(testApp.agent.calls).toEqual([]);
    expect(testApp.conversations.all()).toEqual([]);
  });
});
