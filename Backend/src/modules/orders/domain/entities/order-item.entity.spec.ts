import { MAX_ITEM_QUANTITY, OrderItem } from './order-item.entity';
import {
  InvalidOrderItemPriceError,
  InvalidOrderItemProductError,
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

  describe('create', () => {
    it.each([0, -1])('cantidad %p: lanza InvalidOrderItemQuantityError', (quantity) => {
      expect(() => build({ quantity })).toThrow(InvalidOrderItemQuantityError);
    });

    it.each([1.5, NaN, Infinity, -Infinity])(
      'cantidad %p (no entera o no finita): lanza InvalidOrderItemQuantityError',
      (quantity) => {
        expect(() => build({ quantity })).toThrow(
          InvalidOrderItemQuantityError,
        );
      },
    );

    it('el tope es 99', () => {
      expect(MAX_ITEM_QUANTITY).toBe(99);
    });

    it('cantidad igual al tope (99): es válida', () => {
      expect(build({ quantity: MAX_ITEM_QUANTITY }).quantity).toBe(99);
    });

    it('cantidad por encima del tope (100): lanza InvalidOrderItemQuantityError', () => {
      expect(() => build({ quantity: MAX_ITEM_QUANTITY + 1 })).toThrow(
        InvalidOrderItemQuantityError,
      );
    });

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

    it.each(['', null, undefined])(
      'productId %p: lanza InvalidOrderItemProductError (un ítem nuevo exige id)',
      (productId) => {
        expect(() =>
          OrderItem.create({
            productId: productId as unknown as string,
            productNameSnapshot: 'Limonada natural',
            unitPrice: 6000,
            quantity: 1,
          }),
        ).toThrow(InvalidOrderItemProductError);
      },
    );
  });

  describe('reconstitute', () => {
    it('acepta una cantidad por encima del tope (dato ya persistido, no debe romper la lectura)', () => {
      const item = OrderItem.reconstitute({
        productId: 'product-1',
        productNameSnapshot: 'Limonada natural',
        unitPrice: 6000,
        quantity: 150,
      });

      expect(item.quantity).toBe(150);
      expect(item.subtotal).toBe(900000);
    });

    it('acepta productId null (el producto fue eliminado del catálogo) y conserva el snapshot', () => {
      const item = OrderItem.reconstitute({
        productId: null,
        productNameSnapshot: 'Limonada natural',
        unitPrice: 6000,
        quantity: 2,
      });

      expect(item.productId).toBeNull();
      expect(item.productNameSnapshot).toBe('Limonada natural');
      expect(item.unitPrice).toBe(6000);
    });
  });
});
