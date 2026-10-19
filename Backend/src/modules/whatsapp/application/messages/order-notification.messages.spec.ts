import {
  orderCancelledMessage,
  orderConfirmedMessage,
  orderReference,
} from './order-notification.messages';

// Intl usa un espacio duro (U+00A0) entre el símbolo y el valor.
const normalize = (text: string) => text.replace(/ /g, ' ');

describe('order-notification.messages', () => {
  const orderId = '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77';

  it('la referencia son los primeros 8 caracteres del UUID', () => {
    expect(orderReference(orderId)).toBe('3f1c8a52');
  });

  it('confirmado: incluye referencia y total en pesos colombianos', () => {
    expect(normalize(orderConfirmedMessage({ orderId, total: 36000 }))).toBe(
      '¡Tu pedido #3f1c8a52 fue confirmado! Total: $ 36.000. Gracias por tu compra.',
    );
  });

  it('confirmado: totales con miles y millones usan punto como separador', () => {
    expect(
      normalize(orderConfirmedMessage({ orderId, total: 1234567 })),
    ).toContain('Total: $ 1.234.567.');
  });

  it('confirmado: un total con centavos muestra siempre dos decimales', () => {
    expect(
      normalize(orderConfirmedMessage({ orderId, total: 15000.5 })),
    ).toContain('Total: $ 15.000,50.');
  });

  it('cancelado: incluye la referencia y no menciona el total', () => {
    const text = orderCancelledMessage({ orderId, total: 36000 });

    expect(text).toBe(
      'Tu pedido #3f1c8a52 fue cancelado por el negocio. Si tienes dudas, escríbenos por este chat.',
    );
    expect(text).not.toContain('36');
  });
});
