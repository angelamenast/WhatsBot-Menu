import { parseProposedOrder } from './proposed-order.parser';

const REFS = [
  { ref: 'P1', productId: 'id-uno' },
  { ref: 'P2', productId: 'id-dos' },
  { ref: 'P3', productId: 'id-tres' },
];

describe('parseProposedOrder', () => {
  it('convierte las referencias P1…Pn en ids reales conservando el orden', () => {
    const result = parseProposedOrder({ items: [{ ref: 'P2', quantity: 1 }, { ref: 'P1', quantity: 3 }] }, REFS);

    expect(result).toEqual({
      items: [
        { productId: 'id-dos', quantity: 1 },
        { productId: 'id-uno', quantity: 3 },
      ],
    });
  });

  it('ignora referencias desconocidas (alucinadas) y conserva las válidas', () => {
    const result = parseProposedOrder(
      { items: [{ ref: 'P9', quantity: 1 }, { ref: 'id-uno', quantity: 1 }, { ref: 'P3', quantity: 2 }] },
      REFS,
    );

    expect(result).toEqual({ items: [{ productId: 'id-tres', quantity: 2 }] });
  });

  it('suma las referencias repetidas', () => {
    const result = parseProposedOrder({ items: [{ ref: 'P1', quantity: 1 }, { ref: 'P1', quantity: 2 }] }, REFS);

    expect(result).toEqual({ items: [{ productId: 'id-uno', quantity: 3 }] });
  });

  it('tolera mayúsculas y espacios en la referencia', () => {
    expect(parseProposedOrder({ items: [{ ref: ' p2 ', quantity: 1 }] }, REFS)).toEqual({
      items: [{ productId: 'id-dos', quantity: 1 }],
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity, '2', null, undefined])(
    'descarta el ítem con cantidad inválida (%s)',
    (quantity) => {
      const result = parseProposedOrder({ items: [{ ref: 'P1', quantity }, { ref: 'P2', quantity: 1 }] }, REFS);

      expect(result).toEqual({ items: [{ productId: 'id-dos', quantity: 1 }] });
    },
  );

  it.each([
    ['sin argumentos', undefined],
    ['null', null],
    ['un texto', 'P1 x 2'],
    ['un arreglo', [{ ref: 'P1', quantity: 1 }]],
    ['items que no es arreglo', { items: 'P1' }],
    ['items vacío', { items: [] }],
    ['ítems que no son objetos', { items: ['P1', 3, null] }],
    ['ítems sin ref', { items: [{ quantity: 1 }] }],
    ['ref que no es texto', { items: [{ ref: 1, quantity: 1 }] }],
  ])('%s: devuelve null', (_label, args) => {
    expect(parseProposedOrder(args, REFS)).toBeNull();
  });

  it('si ningún ítem es válido devuelve null', () => {
    expect(parseProposedOrder({ items: [{ ref: 'P9', quantity: 1 }] }, REFS)).toBeNull();
  });

  it('ignora propiedades de más: el modelo no puede colar precios, totales ni ids', () => {
    const result = parseProposedOrder(
      { total: 1, items: [{ ref: 'P1', quantity: 1, price: 1, productId: 'otro', total: 5 }] },
      REFS,
    );

    expect(result).toEqual({ items: [{ productId: 'id-uno', quantity: 1 }] });
    expect(JSON.stringify(result)).not.toMatch(/price|total|otro/);
  });

  it('sin referencias disponibles (catálogo vacío) devuelve null', () => {
    expect(parseProposedOrder({ items: [{ ref: 'P1', quantity: 1 }] }, [])).toBeNull();
  });
});
