import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { CatalogItem } from '../../domain/repositories/catalog.repository';
import { GenerateReplyParams } from '../../application/ports/out/llm.port';
import { FakeLlmProvider } from './fake-llm.adapter';

const LEVELS = ['log', 'warn', 'error', 'debug', 'verbose'] as const;

function spyOnLogger() {
  const spies = LEVELS.map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
  );
  return () =>
    spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map(String).join(' '))
      .join('\n');
}

const item = (id: string, available = true): CatalogItem => ({
  id,
  name: `Producto ${id}`,
  description: null,
  price: 1000,
  available,
  categoryName: null,
});

const paramsFor = (customerMessage: string, catalog: CatalogItem[] = []): GenerateReplyParams => ({
  businessName: 'Mi Restaurante',
  businessHours: null,
  isFirstMessage: false,
  personality: null,
  tone: AgentTone.AMABLE,
  regionalStyle: AgentRegionalStyle.NEUTRO,
  catalog,
  history: [],
  customerMessage,
});

describe('FakeLlmProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('genera la respuesta simulada y NO loguea el mensaje del cliente', async () => {
    const logged = spyOnLogger();

    const result = await new FakeLlmProvider().generateReply(
      paramsFor('Quiero una hamburguesa, mi número es 3001112233'),
    );

    expect(result.text).toContain('Quiero una hamburguesa');
    expect(logged()).not.toContain('Quiero una hamburguesa');
    expect(logged()).not.toContain('3001112233');
  });

  describe('pedido de prueba ("pedido NxM ...")', () => {
    const catalog = [item('p1'), item('p2'), item('p3', false)];

    it('mensaje normal: sin pedido propuesto', async () => {
      const result = await new FakeLlmProvider().generateReply(paramsFor('Hola, ¿qué tienen?', catalog));

      expect(result.proposedOrder).toBeNull();
    });

    it('cada par NxM es el producto en la posición N (base 1) con M unidades', async () => {
      const result = await new FakeLlmProvider().generateReply(paramsFor('pedido 1x2 2x1', catalog));

      expect(result.proposedOrder).toEqual({
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 1 },
        ],
      });
    });

    it('insensible a mayúsculas y a espacios alrededor', async () => {
      const result = await new FakeLlmProvider().generateReply(paramsFor('  PEDIDO   3X1  ', catalog));

      expect(result.proposedOrder).toEqual({ items: [{ productId: 'p3', quantity: 1 }] });
    });

    it('posiciones fuera de rango (0 o mayores al catálogo) se ignoran', async () => {
      const result = await new FakeLlmProvider().generateReply(paramsFor('pedido 0x1 1x1 9x4', catalog));

      expect(result.proposedOrder).toEqual({ items: [{ productId: 'p1', quantity: 1 }] });
    });

    it('si todas las posiciones están fuera de rango: proposedOrder es null', async () => {
      const result = await new FakeLlmProvider().generateReply(paramsFor('pedido 7x1 8x2', catalog));

      expect(result.proposedOrder).toBeNull();
    });

    it('catálogo vacío: proposedOrder es null', async () => {
      const result = await new FakeLlmProvider().generateReply(paramsFor('pedido 1x1'));

      expect(result.proposedOrder).toBeNull();
    });

    it.each(['pedido', 'pedido 1x', 'quiero un pedido 1x2', 'pedido 1x2 gracias', 'pedido 1 2'])(
      'no coincide con el patrón (%s): sin pedido propuesto',
      async (message) => {
        const result = await new FakeLlmProvider().generateReply(paramsFor(message, catalog));

        expect(result.proposedOrder).toBeNull();
      },
    );
  });
});
