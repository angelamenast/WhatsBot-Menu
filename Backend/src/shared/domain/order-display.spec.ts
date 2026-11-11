import { formatCop, orderReference } from './order-display';

describe('orderReference', () => {
  it('son los primeros 8 caracteres del UUID', () => {
    expect(orderReference('3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77')).toBe('3f1c8a52');
  });

  it('un id más corto se devuelve completo', () => {
    expect(orderReference('abc')).toBe('abc');
  });
});

describe('formatCop', () => {
  // Intl separa el símbolo con un espacio duro (U+00A0): se normaliza para no depender de él.
  const plain = (value: string) => value.replace(/ /g, ' ');

  it('pesos enteros sin decimales', () => {
    expect(plain(formatCop(36000))).toBe('$ 36.000');
    expect(plain(formatCop(0))).toBe('$ 0');
  });

  it('con centavos, siempre dos decimales', () => {
    expect(plain(formatCop(15000.5))).toBe('$ 15.000,50');
  });
});
