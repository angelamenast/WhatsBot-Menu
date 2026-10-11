import { CreateOrderUseCase } from './create-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import {
  CatalogLookupRepository,
  CatalogProductSnapshot,
} from '../../domain/repositories/catalog-lookup.repository';
import { OrderStatus } from '../../domain/entities/order.entity';
import {
  ConversationNotInBusinessError,
  EmptyOrderError,
} from '../../domain/errors/order.errors';
import { CreateOrderCommand } from '../dto/create-order.command';

const BURGER_ID = '11111111-1111-4111-8111-111111111111';
const LEMONADE_ID = '22222222-2222-4222-8222-222222222222';
const SOLD_OUT_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_ID = '44444444-4444-4444-8444-444444444444';

const burger: CatalogProductSnapshot = {
  id: BURGER_ID,
  name: 'Hamburguesa clásica',
  price: 15000,
  available: true,
};
const lemonade: CatalogProductSnapshot = {
  id: LEMONADE_ID,
  name: 'Limonada natural',
  price: 6000,
  available: true,
};
const soldOut: CatalogProductSnapshot = {
  id: SOLD_OUT_ID,
  name: 'Perro caliente',
  price: 9000,
  available: false,
};

describe('CreateOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let catalogLookupRepository: jest.Mocked<CatalogLookupRepository>;
  let useCase: CreateOrderUseCase;

  const commandWith = (
    items: CreateOrderCommand['items'],
  ): CreateOrderCommand => ({
    businessId: 'business-1',
    conversationId: 'conversation-1',
    items,
  });

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findAllByBusinessId: jest.fn(),
      insert: jest.fn(),
      updateStatus: jest.fn(),
    };
    catalogLookupRepository = {
      findManyByIds: jest.fn(),
    };

    useCase = new CreateOrderUseCase(orderRepository, catalogLookupRepository);
  });

  it('todos los ítems válidos: crea el pedido PENDING con snapshot del catálogo y sin rechazados', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

    const { order, rejectedItems } = await useCase.execute(
      commandWith([{ productId: BURGER_ID, quantity: 2 }]),
    );

    expect(catalogLookupRepository.findManyByIds).toHaveBeenCalledWith(
      'business-1',
      [BURGER_ID],
    );
    expect(rejectedItems).toEqual([]);
    expect(order?.status).toBe(OrderStatus.PENDING);
    expect(order?.items).toHaveLength(1);
    expect(order?.items[0].productNameSnapshot).toBe('Hamburguesa clásica');
    expect(order?.items[0].unitPrice).toBe(15000);
    expect(order?.total).toBe(30000);
    expect(orderRepository.insert).toHaveBeenCalledTimes(1);
    expect(orderRepository.insert).toHaveBeenCalledWith(order);
  });

  it('no confía en un nombre/precio del invocador: siempre usa lo que devuelve el catálogo', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([
      { ...burger, name: 'Nombre real en catálogo', price: 99999 },
    ]);

    const { order } = await useCase.execute(
      commandWith([{ productId: BURGER_ID, quantity: 1 }]),
    );

    expect(order?.items[0].productNameSnapshot).toBe('Nombre real en catálogo');
    expect(order?.items[0].unitPrice).toBe(99999);
  });

  it('lista de items vacía: lanza EmptyOrderError sin consultar el catálogo ni insertar', async () => {
    await expect(useCase.execute(commandWith([]))).rejects.toThrow(
      EmptyOrderError,
    );

    expect(catalogLookupRepository.findManyByIds).not.toHaveBeenCalled();
    expect(orderRepository.insert).not.toHaveBeenCalled();
  });

  describe('validación por ítem', () => {
    it('un ítem inválido entre varios válidos: se crea el pedido con los válidos y el inválido se reporta', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      const { order, rejectedItems } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: MISSING_ID, quantity: 1 },
        ]),
      );

      expect(order?.items.map((i) => i.productId)).toEqual([BURGER_ID]);
      expect(rejectedItems).toEqual([
        { productId: MISSING_ID, reason: 'NOT_FOUND' },
      ]);
      expect(orderRepository.insert).toHaveBeenCalledTimes(1);
    });

    it('todos inválidos: order null, no inserta y no lanza', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([soldOut]);

      const result = await useCase.execute(
        commandWith([
          { productId: SOLD_OUT_ID, quantity: 1 },
          { productId: MISSING_ID, quantity: 1 },
        ]),
      );

      expect(result.order).toBeNull();
      expect(result.rejectedItems).toHaveLength(2);
      expect(orderRepository.insert).not.toHaveBeenCalled();
    });

    it('mezcla de NOT_FOUND, UNAVAILABLE e INVALID_QUANTITY: cada uno con su razón', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([
        burger,
        soldOut,
      ]);

      const { order, rejectedItems } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: SOLD_OUT_ID, quantity: 1 },
          { productId: MISSING_ID, quantity: 1 },
          { productId: LEMONADE_ID, quantity: 0 },
        ]),
      );

      expect(order?.items.map((i) => i.productId)).toEqual([BURGER_ID]);
      expect(rejectedItems).toEqual(
        expect.arrayContaining([
          { productId: SOLD_OUT_ID, reason: 'UNAVAILABLE' },
          { productId: MISSING_ID, reason: 'NOT_FOUND' },
          { productId: LEMONADE_ID, reason: 'INVALID_QUANTITY' },
        ]),
      );
      expect(rejectedItems).toHaveLength(3);
    });

    it.each([0, -2, 1.5, NaN, Infinity])(
      'cantidad %p: se rechaza con INVALID_QUANTITY',
      async (quantity) => {
        catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

        const { order, rejectedItems } = await useCase.execute(
          commandWith([
            { productId: BURGER_ID, quantity: 1 },
            { productId: LEMONADE_ID, quantity },
          ]),
        );

        expect(order?.items).toHaveLength(1);
        expect(rejectedItems).toEqual([
          { productId: LEMONADE_ID, reason: 'INVALID_QUANTITY' },
        ]);
      },
    );

    it('un producto con cantidad inválida no llega a la consulta del catálogo', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: LEMONADE_ID, quantity: -1 },
        ]),
      );

      expect(catalogLookupRepository.findManyByIds).toHaveBeenCalledWith(
        'business-1',
        [BURGER_ID],
      );
    });

    it('mismo producto rechazado en varias líneas por la misma razón: aparece una sola vez', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      const { rejectedItems } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: MISSING_ID, quantity: 1 },
          { productId: MISSING_ID, quantity: 3 },
          { productId: LEMONADE_ID, quantity: 0 },
          { productId: LEMONADE_ID, quantity: -1 },
        ]),
      );

      expect(rejectedItems).toEqual([
        { productId: LEMONADE_ID, reason: 'INVALID_QUANTITY' },
        { productId: MISSING_ID, reason: 'NOT_FOUND' },
      ]);
    });
  });

  describe('fusión de duplicados', () => {
    it('líneas válidas del mismo producto: una sola línea con la cantidad sumada', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      const { order } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: BURGER_ID, quantity: 2 },
        ]),
      );

      expect(order?.items).toHaveLength(1);
      expect(order?.items[0].quantity).toBe(3);
      expect(order?.total).toBe(45000);
    });

    it('conserva el orden de primera aparición y consulta el catálogo con ids únicos', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([
        burger,
        lemonade,
      ]);

      const { order } = await useCase.execute(
        commandWith([
          { productId: LEMONADE_ID, quantity: 1 },
          { productId: BURGER_ID, quantity: 1 },
          { productId: LEMONADE_ID, quantity: 1 },
        ]),
      );

      expect(catalogLookupRepository.findManyByIds).toHaveBeenCalledTimes(1);
      expect(catalogLookupRepository.findManyByIds).toHaveBeenCalledWith(
        'business-1',
        [LEMONADE_ID, BURGER_ID],
      );
      expect(order?.items.map((i) => [i.productId, i.quantity])).toEqual([
        [LEMONADE_ID, 2],
        [BURGER_ID, 1],
      ]);
    });

    it('duplicado con una línea de cantidad inválida: la válida se conserva y la inválida se reporta', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      const { order, rejectedItems } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 2 },
          { productId: BURGER_ID, quantity: 0 },
        ]),
      );

      expect(order?.items).toHaveLength(1);
      expect(order?.items[0].quantity).toBe(2);
      expect(rejectedItems).toEqual([
        { productId: BURGER_ID, reason: 'INVALID_QUANTITY' },
      ]);
    });

    it('el mismo uuid en mayúsculas y minúsculas se fusiona como un solo producto', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      const { order, rejectedItems } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: BURGER_ID.toUpperCase(), quantity: 1 },
        ]),
      );

      expect(rejectedItems).toEqual([]);
      expect(order?.items).toHaveLength(1);
      expect(order?.items[0].quantity).toBe(2);
    });
  });

  describe('productId malformado', () => {
    it('no es un UUID: NOT_FOUND y no llega a la consulta del catálogo', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);

      const { order, rejectedItems } = await useCase.execute(
        commandWith([
          { productId: BURGER_ID, quantity: 1 },
          { productId: 'product-1', quantity: 1 },
          { productId: "' or 1=1 --", quantity: 1 },
        ]),
      );

      expect(catalogLookupRepository.findManyByIds).toHaveBeenCalledWith(
        'business-1',
        [BURGER_ID],
      );
      expect(order?.items).toHaveLength(1);
      expect(rejectedItems).toEqual([
        { productId: 'product-1', reason: 'NOT_FOUND' },
        { productId: "' or 1=1 --", reason: 'NOT_FOUND' },
      ]);
    });

    it('todos los ids malformados: no consulta el catálogo, no inserta y devuelve order null', async () => {
      const result = await useCase.execute(
        commandWith([{ productId: 'abc', quantity: 1 }]),
      );

      expect(result.order).toBeNull();
      expect(result.rejectedItems).toEqual([
        { productId: 'abc', reason: 'NOT_FOUND' },
      ]);
      expect(catalogLookupRepository.findManyByIds).not.toHaveBeenCalled();
      expect(orderRepository.insert).not.toHaveBeenCalled();
    });
  });

  it('el total corresponde solo a los ítems aceptados', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([
      burger,
      lemonade,
      soldOut,
    ]);

    const { order } = await useCase.execute(
      commandWith([
        { productId: BURGER_ID, quantity: 2 }, // 30000
        { productId: LEMONADE_ID, quantity: 1 }, //  6000
        { productId: SOLD_OUT_ID, quantity: 5 }, // rechazado
        { productId: MISSING_ID, quantity: 4 }, // rechazado
      ]),
    );

    expect(order?.total).toBe(36000);
  });

  describe('errores de infraestructura', () => {
    it('error del repositorio en insert: se propaga', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);
      const dbError = new Error('db caída');
      orderRepository.insert.mockRejectedValue(dbError);

      await expect(
        useCase.execute(commandWith([{ productId: BURGER_ID, quantity: 1 }])),
      ).rejects.toBe(dbError);
    });

    it('conversación de otro negocio: ConversationNotInBusinessError se propaga sin capturar', async () => {
      catalogLookupRepository.findManyByIds.mockResolvedValue([burger]);
      orderRepository.insert.mockRejectedValue(
        new ConversationNotInBusinessError('conversation-1', 'business-1'),
      );

      await expect(
        useCase.execute(commandWith([{ productId: BURGER_ID, quantity: 1 }])),
      ).rejects.toThrow(ConversationNotInBusinessError);
    });

    it('error del lookup del catálogo: se propaga', async () => {
      const lookupError = new Error('catálogo caído');
      catalogLookupRepository.findManyByIds.mockRejectedValue(lookupError);

      await expect(
        useCase.execute(commandWith([{ productId: BURGER_ID, quantity: 1 }])),
      ).rejects.toBe(lookupError);

      expect(orderRepository.insert).not.toHaveBeenCalled();
    });
  });
});
