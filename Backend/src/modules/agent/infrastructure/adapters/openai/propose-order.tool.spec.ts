import { PRODUCT_REF_PATTERN, PROPOSE_ORDER_TOOL, PROPOSE_ORDER_TOOL_NAME } from './propose-order.tool';

type Schema = {
  type: string;
  properties: { items: { type: string; minItems: number; items: Schema } };
  required: string[];
  additionalProperties: boolean;
};

describe('PROPOSE_ORDER_TOOL', () => {
  const parameters = PROPOSE_ORDER_TOOL.function.parameters as unknown as Schema;
  const item = parameters.properties.items.items as unknown as {
    properties: { ref: { type: string; pattern: string }; quantity: { type: string; minimum: number } };
    required: string[];
    additionalProperties: boolean;
  };

  it('es una función llamada propose_order en modo estricto', () => {
    expect(PROPOSE_ORDER_TOOL.type).toBe('function');
    expect(PROPOSE_ORDER_TOOL.function.name).toBe('propose_order');
    expect(PROPOSE_ORDER_TOOL_NAME).toBe('propose_order');
    expect(PROPOSE_ORDER_TOOL.function.strict).toBe(true);
  });

  it('items es un arreglo con mínimo 1 y sin propiedades adicionales', () => {
    expect(parameters.properties.items.type).toBe('array');
    expect(parameters.properties.items.minItems).toBe(1);
    expect(parameters.required).toEqual(['items']);
    expect(parameters.additionalProperties).toBe(false);
  });

  it('cada ítem es { ref, quantity } con ref ^P\\d+$ y quantity entero >= 1, sin extras', () => {
    expect(item.properties.ref.type).toBe('string');
    expect(item.properties.quantity.type).toBe('integer');
    expect(item.properties.quantity.minimum).toBe(1);
    expect(item.required).toEqual(['ref', 'quantity']);
    expect(item.additionalProperties).toBe(false);
    expect(Object.keys(item.properties)).toEqual(['ref', 'quantity']);
  });

  it('el patrón conserva el escape de dígito (backslash + d), no una letra d', () => {
    expect(PRODUCT_REF_PATTERN).toBe('^P' + String.fromCharCode(92) + 'd+$');
  });

  it('el patrón de ref acepta P1, P12 y rechaza lo demás', () => {
    const pattern = new RegExp(PRODUCT_REF_PATTERN);

    expect(item.properties.ref.pattern).toBe(PRODUCT_REF_PATTERN);
    expect(pattern.test('P1')).toBe(true);
    expect(pattern.test('P12')).toBe(true);
    for (const bad of ['p1', 'P', 'P1x', 'xP1', '1', 'P-1', 'P1\nP2', '', 'producto']) {
      expect(pattern.test(bad)).toBe(false);
    }
  });

  it('la descripción exige confirmación explícita, prohíbe consultas y agotados', () => {
    expect(PROPOSE_ORDER_TOOL.function.description).toMatch(/confirmado de forma explícita/);
    expect(PROPOSE_ORDER_TOOL.function.description).toMatch(/lista final con cantidades/);
    expect(PROPOSE_ORDER_TOOL.function.description).toMatch(/No la uses para consultas/);
    expect(PROPOSE_ORDER_TOOL.function.description).toMatch(/agotados/);
  });

  it('no pide precios, totales ni ids reales', () => {
    expect(JSON.stringify(PROPOSE_ORDER_TOOL)).not.toMatch(/price|precio|total|productId|"id"/i);
  });
});
