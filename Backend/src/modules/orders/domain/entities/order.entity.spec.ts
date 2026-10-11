import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import {
  EmptyOrderError,
  InvalidOrderTransitionError,
} from '../errors/order.errors';

describe('Order', () => {
  const anItem = (
    overrides: Partial<{ unitPrice: number; quantity: number }> = {},
  ) =>
    OrderItem.create({
      productId: 'product-1',
      productNameSnapshot: 'Hamburguesa clásica',
      unitPrice: overrides.unitPrice ?? 15000,
      quantity: overrides.quantity ?? 1,
    });

  describe('createPending', () => {
    it('crea el pedido en estado PENDING', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });

      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.businessId).toBe('business-1');
      expect(order.conversationId).toBe('conversation-1');
    });

    it('sin items: lanza EmptyOrderError', () => {
      expect(() =>
        Order.createPending({
          businessId: 'business-1',
          conversationId: 'conversation-1',
          items: [],
        }),
      ).toThrow(EmptyOrderError);
    });

    it('createdAt y updatedAt quedan iguales al momento de crear', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });

      expect(order.createdAt.getTime()).toBe(order.updatedAt.getTime());
    });
  });

  describe('total', () => {
    it('redondea a 2 decimales: 0.1 x 3 es 0.3 y no 0.30000000000000004', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem({ unitPrice: 0.1, quantity: 3 })],
      });

      expect(order.total).toBe(0.3);
    });

    it('redondea la suma completa, no cada subtotal', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [
          anItem({ unitPrice: 0.1, quantity: 1 }),
          anItem({ unitPrice: 0.2, quantity: 1 }),
        ],
      });

      expect(order.total).toBe(0.3);
    });

    it('suma el subtotal de todos los items', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [
          anItem({ unitPrice: 15000, quantity: 2 }), // 30000
          anItem({ unitPrice: 6000, quantity: 1 }), //  6000
        ],
      });

      expect(order.total).toBe(36000);
    });

    it('es 0 si el pedido hidratado desde BD no tiene items (pedido huérfano)', () => {
      const order = Order.reconstitute({
        id: 'order-1',
        businessId: 'business-1',
        conversationId: 'conversation-1',
        status: OrderStatus.PENDING,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(order.total).toBe(0);
    });
  });

  describe('reconstitute', () => {
    it('hidrata id, estado y fechas tal cual vienen de BD, sin validar', () => {
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');

      const order = Order.reconstitute({
        id: 'order-9',
        businessId: 'business-1',
        conversationId: 'conversation-1',
        status: OrderStatus.CONFIRMED,
        items: [],
        createdAt,
        updatedAt,
      });

      expect(order.id).toBe('order-9');
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.createdAt).toBe(createdAt);
      expect(order.updatedAt).toBe(updatedAt);
    });

    it('un pedido hidratado respeta las transiciones: CANCELLED no se puede confirmar', () => {
      const order = Order.reconstitute({
        id: 'order-1',
        businessId: 'business-1',
        conversationId: 'conversation-1',
        status: OrderStatus.CANCELLED,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(() => order.confirm()).toThrow(InvalidOrderTransitionError);
    });

    it('no expone Order.create: la única vía pública de construcción son createPending y reconstitute', () => {
      expect((Order as unknown as Record<string, unknown>).create).toBeUndefined();
    });
  });

  describe('items', () => {
    it('devuelve una copia: mutarla no altera los items del pedido ni su total', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem({ unitPrice: 1000, quantity: 1 })],
      });

      (order.items as OrderItem[]).push(anItem({ unitPrice: 999, quantity: 9 }));

      expect(order.items).toHaveLength(1);
      expect(order.total).toBe(1000);
    });

    it('el array con el que se construyó el pedido tampoco puede mutarlo después', () => {
      const source = [anItem({ unitPrice: 1000, quantity: 1 })];
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: source,
      });

      source.push(anItem({ unitPrice: 999, quantity: 9 }));

      expect(order.items).toHaveLength(1);
      expect(order.total).toBe(1000);
    });
  });

  describe('confirm', () => {
    it('PENDING → CONFIRMED: válido, actualiza updatedAt', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });
      const updatedAtBefore = order.updatedAt;

      order.confirm();

      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.updatedAt.getTime()).toBeGreaterThanOrEqual(
        updatedAtBefore.getTime(),
      );
    });

    it('CONFIRMED → CONFIRMED (doble confirmación): lanza InvalidOrderTransitionError', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });
      order.confirm();

      expect(() => order.confirm()).toThrow(InvalidOrderTransitionError);
    });

    it('CANCELLED → CONFIRMED: lanza InvalidOrderTransitionError', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });
      order.cancel();

      expect(() => order.confirm()).toThrow(InvalidOrderTransitionError);
    });
  });

  describe('cancel', () => {
    it('PENDING → CANCELLED: válido', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });

      order.cancel();

      expect(order.status).toBe(OrderStatus.CANCELLED);
    });

    it('CONFIRMED → CANCELLED: válido (el dueño puede cancelar algo ya confirmado)', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });
      order.confirm();

      order.cancel();

      expect(order.status).toBe(OrderStatus.CANCELLED);
    });

    it('CANCELLED → CANCELLED (doble cancelación): lanza InvalidOrderTransitionError', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [anItem()],
      });
      order.cancel();

      expect(() => order.cancel()).toThrow(InvalidOrderTransitionError);
    });
  });
});
