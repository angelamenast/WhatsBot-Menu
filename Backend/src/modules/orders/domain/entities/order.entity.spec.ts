import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { InvalidOrderTransitionError } from '../errors/order.errors';

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

    it('es 0 si el pedido no tiene items', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [],
      });

      expect(order.total).toBe(0);
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
