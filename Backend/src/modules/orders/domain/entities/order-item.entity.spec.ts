import { OrderItem } from './order-item.entity';

describe('OrderItem', () => {
  it('calcula el subtotal como unitPrice * quantity', () => {
    const item = OrderItem.create({
      productId: 'product-1',
      productNameSnapshot: 'Limonada natural',
      unitPrice: 6000,
      quantity: 3,
    });

    expect(item.subtotal).toBe(18000);
  });

  it('cantidad 0: lanza error', () => {
    expect(() =>
      OrderItem.create({
        productId: 'product-1',
        productNameSnapshot: 'Limonada natural',
        unitPrice: 6000,
        quantity: 0,
      }),
    ).toThrow('La cantidad de un item debe ser mayor a cero');
  });

  it('cantidad negativa: lanza error', () => {
    expect(() =>
      OrderItem.create({
        productId: 'product-1',
        productNameSnapshot: 'Limonada natural',
        unitPrice: 6000,
        quantity: -1,
      }),
    ).toThrow('La cantidad de un item debe ser mayor a cero');
  });

  it('precio unitario negativo: lanza error', () => {
    expect(() =>
      OrderItem.create({
        productId: 'product-1',
        productNameSnapshot: 'Limonada natural',
        unitPrice: -100,
        quantity: 1,
      }),
    ).toThrow('El precio unitario no puede ser negativo');
  });

  it('precio unitario 0: es válido (ej. ítem promocional)', () => {
    const item = OrderItem.create({
      productId: 'product-1',
      productNameSnapshot: 'Propina sugerida',
      unitPrice: 0,
      quantity: 1,
    });

    expect(item.subtotal).toBe(0);
  });
});
