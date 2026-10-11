import { OrderItem } from './order-item.entity';
import {
  InvalidOrderItemPriceError,
  InvalidOrderItemQuantityError,
} from '../errors/order.errors';

describe('OrderItem', () => {
  const build = (overrides: { unitPrice?: number; quantity?: number } = {}) =>
    OrderItem.create({
      productId: 'product-1',
      productNameSnapshot: 'Limonada natural',
      unitPrice: overrides.unitPrice ?? 6000,
      quantity: overrides.quantity ?? 1,
    });

  it('calcula el subtotal como unitPrice * quantity', () => {
    expect(build({ unitPrice: 6000, quantity: 3 }).subtotal).toBe(18000);
  });

  it.each([0, -1])('cantidad %p: lanza InvalidOrderItemQuantityError', (quantity) => {
    expect(() => build({ quantity })).toThrow(InvalidOrderItemQuantityError);
  });

  it.each([1.5, NaN, Infinity, -Infinity])(
    'cantidad %p (no entera o no finita): lanza InvalidOrderItemQuantityError',
    (quantity) => {
      expect(() => build({ quantity })).toThrow(InvalidOrderItemQuantityError);
    },
  );

  it('precio unitario negativo: lanza InvalidOrderItemPriceError', () => {
    expect(() => build({ unitPrice: -100 })).toThrow(
      InvalidOrderItemPriceError,
    );
  });

  it.each([NaN, Infinity, -Infinity])(
    'precio unitario %p (no finito): lanza InvalidOrderItemPriceError',
    (unitPrice) => {
      expect(() => build({ unitPrice })).toThrow(InvalidOrderItemPriceError);
    },
  );

  it('precio unitario 0: es válido (ej. ítem promocional)', () => {
    expect(build({ unitPrice: 0 }).subtotal).toBe(0);
  });
});
