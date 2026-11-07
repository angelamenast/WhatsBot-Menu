import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { OrderStatusChangedListener } from './order-status-changed.listener';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { CloseConversationUseCase } from '../../application/use-cases/close-conversation.use-case';
import {
  orderCancelledMessage,
  orderConfirmedMessage,
} from '../../application/messages/order-notification.messages';
import { ConversationNotFoundError } from '../../domain/errors/whatsapp.errors';
import {
  ORDER_STATUS_CHANGED_EVENT,
  OrderStatusChangedEvent,
} from '../../../../shared/events/order-status-changed.event';

type AnyFn = (...args: any[]) => any;

describe('OrderStatusChangedListener', () => {
  let sendMessageUseCase: { execute: jest.Mock<AnyFn> };
  let closeConversationUseCase: { execute: jest.Mock<AnyFn> };

  const event = (
    status: OrderStatusChangedEvent['status'],
  ): OrderStatusChangedEvent => ({
    orderId: '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77',
    businessId: 'business-1',
    conversationId: 'conversation-1',
    status,
    total: 36000,
    occurredAt: new Date('2026-10-15T10:00:00Z'),
  });

  let loggerSpies: Array<jest.SpiedFunction<any>>;

  beforeEach(() => {
    sendMessageUseCase = { execute: jest.fn<AnyFn>().mockResolvedValue(undefined) };
    closeConversationUseCase = { execute: jest.fn<AnyFn>().mockResolvedValue(undefined) };
    loggerSpies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
      (level) => jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const allLoggedText = () =>
    loggerSpies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map(String).join(' '))
      .join('\n');

  describe('handle', () => {
    let listener: OrderStatusChangedListener;

    beforeEach(() => {
      listener = new OrderStatusChangedListener(
        sendMessageUseCase as unknown as SendMessageUseCase,
        closeConversationUseCase as unknown as CloseConversationUseCase,
      );
    });

    it('CONFIRMED: envía el texto de confirmado a la conversación del evento', async () => {
      await listener.handle(event('CONFIRMED'));

      expect(sendMessageUseCase.execute).toHaveBeenCalledTimes(1);
      expect(sendMessageUseCase.execute).toHaveBeenCalledWith({
        conversationId: 'conversation-1',
        body: orderConfirmedMessage({
          orderId: '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77',
          total: 36000,
        }),
      });
    });

    it('CANCELLED: envía el texto de cancelado a la conversación del evento', async () => {
      await listener.handle(event('CANCELLED'));

      expect(sendMessageUseCase.execute).toHaveBeenCalledWith({
        conversationId: 'conversation-1',
        body: orderCancelledMessage({
          orderId: '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77',
          total: 36000,
        }),
      });
    });

    it('si SendMessageUseCase lanza, el handler no propaga y registra solo ids', async () => {
      sendMessageUseCase.execute.mockRejectedValue(
        new ConversationNotFoundError('conversation-1'),
      );

      await expect(listener.handle(event('CONFIRMED'))).resolves.toBeUndefined();

      const logged = allLoggedText();
      expect(logged).toContain('3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77');
      expect(logged).toContain('business-1');
      expect(logged).toContain('conversation-1');
    });

    it('un error que no es Error (p. ej. objeto de Supabase) tampoco se propaga ni se vuelca entero al log', async () => {
      sendMessageUseCase.execute.mockRejectedValue({
        message: 'boom',
        details: 'Key (numero_cliente)=(+573001112233) ya existe',
      });

      await expect(listener.handle(event('CANCELLED'))).resolves.toBeUndefined();

      expect(allLoggedText()).not.toContain('+573001112233');
    });

    describe('cierre de la conversación', () => {
      it('CONFIRMED: notifica y DESPUÉS cierra la conversación del evento', async () => {
        const order: string[] = [];
        sendMessageUseCase.execute.mockImplementation(async () => {
          order.push('send');
        });
        closeConversationUseCase.execute.mockImplementation(async () => {
          order.push('close');
        });

        await listener.handle(event('CONFIRMED'));

        expect(closeConversationUseCase.execute).toHaveBeenCalledWith('conversation-1');
        expect(order).toEqual(['send', 'close']);
      });

      it('CONFIRMED: cierra aunque el envío haya fallado', async () => {
        sendMessageUseCase.execute.mockRejectedValue(new Error('Proveedor caído'));

        await expect(listener.handle(event('CONFIRMED'))).resolves.toBeUndefined();

        expect(closeConversationUseCase.execute).toHaveBeenCalledWith('conversation-1');
      });

      it('CONFIRMED: si el cierre falla no propaga y loguea solo ids', async () => {
        closeConversationUseCase.execute.mockRejectedValue(new ConversationNotFoundError('conversation-1'));

        await expect(listener.handle(event('CONFIRMED'))).resolves.toBeUndefined();

        const logged = allLoggedText();
        expect(logged).toContain('conversation-1');
        expect(logged).toContain('3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77');
        expect(logged).not.toMatch(/\+\d{6,}/);
      });

      it('CONFIRMED: un error de cierre que no es Error (objeto de Supabase) no vuelca sus detalles al log', async () => {
        closeConversationUseCase.execute.mockRejectedValue({
          details: 'Key (numero_cliente)=(+573001112233) ya existe',
        });

        await expect(listener.handle(event('CONFIRMED'))).resolves.toBeUndefined();

        expect(allLoggedText()).not.toContain('+573001112233');
      });

      it('CANCELLED: solo notifica, no cierra la conversación', async () => {
        await listener.handle(event('CANCELLED'));

        expect(sendMessageUseCase.execute).toHaveBeenCalledTimes(1);
        expect(closeConversationUseCase.execute).not.toHaveBeenCalled();
      });
    });

    it('nunca registra teléfonos ni el cuerpo del mensaje', async () => {
      sendMessageUseCase.execute.mockRejectedValue(new Error('falló'));

      await listener.handle(event('CONFIRMED'));
      await listener.handle(event('CANCELLED'));

      const logged = allLoggedText();
      expect(logged).not.toMatch(/\+\d{6,}/);
      expect(logged).not.toContain('Gracias por tu compra');
      expect(logged).not.toContain('escríbenos por este chat');
    });
  });

  describe('integración con el emisor de eventos real', () => {
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          OrderStatusChangedListener,
          { provide: SendMessageUseCase, useValue: sendMessageUseCase },
          { provide: CloseConversationUseCase, useValue: closeConversationUseCase },
        ],
      }).compile();
      // init() registra los @OnEvent en el emisor.
      await moduleRef.init();
    });

    afterEach(async () => {
      await moduleRef.close();
    });

    it('al emitir ORDER_STATUS_CHANGED_EVENT, el listener lo recibe y envía el mensaje', async () => {
      const emitter = moduleRef.get(EventEmitter2);

      // emitAsync solo en el test, para esperar al handler; el adapter de orders usa emit.
      await emitter.emitAsync(ORDER_STATUS_CHANGED_EVENT, event('CONFIRMED'));

      expect(sendMessageUseCase.execute).toHaveBeenCalledTimes(1);
      expect(sendMessageUseCase.execute).toHaveBeenCalledWith({
        conversationId: 'conversation-1',
        body: orderConfirmedMessage({
          orderId: '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77',
          total: 36000,
        }),
      });
    });

    it('un fallo en el listener no hace fallar al emisor', async () => {
      sendMessageUseCase.execute.mockRejectedValue(new Error('falló'));
      const emitter = moduleRef.get(EventEmitter2);

      await expect(
        emitter.emitAsync(ORDER_STATUS_CHANGED_EVENT, event('CANCELLED')),
      ).resolves.toBeDefined();
    });
  });
});
