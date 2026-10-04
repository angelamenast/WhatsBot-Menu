import { CreateOrderUseCase } from './create-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { CatalogLookupRepository } from '../../domain/repositories/catalog-lookup.repository';
import { OrderStatus } from '../../domain/entities/order.entity';
import {
  EmptyOrderError,
  ProductNotFoundError,
  ProductUnavailableError,
} from '../../domain/errors/order.errors';
import { CreateOrderCommand } from '../dto/create-order.command';

describe('CreateOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let catalogLookupRepository: jest.Mocked<CatalogLookupRepository>;
  let useCase: CreateOrderUseCase;

  const command: CreateOrderCommand = {
    businessId: 'business-1',
    conversationId: 'conversation-1',
    items: [{ productId: 'product-1', quantity: 2 }],
  };

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findAllByBusinessId: jest.fn(),
      save: jest.fn(),
    };
    catalogLookupRepository = {
      findManyByIds: jest.fn(),
    };

    useCase = new CreateOrderUseCase(orderRepository, catalogLookupRepository);
  });

  it('crea el pedido en PENDING con los items validados contra el catálogo real', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Hamburguesa clásica',
        price: 15000,
        available: true,
      },
    ]);

    const result = await useCase.execute(command);

    expect(catalogLookupRepository.findManyByIds).toHaveBeenCalledWith(
      'business-1',
      ['product-1'],
    );
    expect(result.status).toBe(OrderStatus.PENDING);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].productNameSnapshot).toBe('Hamburguesa clásica');
    expect(result.items[0].unitPrice).toBe(15000);
    expect(result.total).toBe(30000);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
  });

  it('no confía en un nombre/precio enviado por el invocador: siempre usa lo que devuelve el catálogo', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Nombre real en catálogo',
        price: 99999,
        available: true,
      },
    ]);

    const result = await useCase.execute(command);

    expect(result.items[0].productNameSnapshot).toBe('Nombre real en catálogo');
    expect(result.items[0].unitPrice).toBe(99999);
  });

  it('lista de items vacía: lanza EmptyOrderError y no consulta el catálogo', async () => {
    const emptyCommand: CreateOrderCommand = { ...command, items: [] };

    await expect(useCase.execute(emptyCommand)).rejects.toThrow(
      EmptyOrderError,
    );

    expect(catalogLookupRepository.findManyByIds).not.toHaveBeenCalled();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('producto inexistente en el catálogo del negocio: lanza ProductNotFoundError', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([]);

    await expect(useCase.execute(command)).rejects.toThrow(
      ProductNotFoundError,
    );

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('producto existente pero no disponible: lanza ProductUnavailableError', async () => {
    catalogLookupRepository.findManyByIds.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Hamburguesa clásica',
        price: 15000,
        available: false,
      },
    ]);

    await expect(useCase.execute(command)).rejects.toThrow(
      ProductUnavailableError,
    );

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('un item inválido entre varios: ninguno se guarda (falla todo el pedido, no parcialmente)', async () => {
    const multiItemCommand: CreateOrderCommand = {
      ...command,
      items: [
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 },
      ],
    };
    catalogLookupRepository.findManyByIds.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Hamburguesa clásica',
        price: 15000,
        available: true,
      },
      // product-2 no viene en la respuesta del catálogo: no existe
    ]);

    await expect(useCase.execute(multiItemCommand)).rejects.toThrow(
      ProductNotFoundError,
    );

    expect(orderRepository.save).not.toHaveBeenCalled();
  });
});
