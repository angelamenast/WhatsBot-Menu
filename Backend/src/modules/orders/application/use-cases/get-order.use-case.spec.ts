import { GetOrderUseCase } from './get-order.use-case';
import {
  OrderRepository,
  OrderView,
} from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderNotFoundError } from '../../domain/errors/order.errors';

describe('GetOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let useCase: GetOrderUseCase;

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findViewById: jest.fn(),
      findViewsByBusiness: jest.fn(),
      insert: jest.fn(),
      updateStatus: jest.fn(),
    };

    useCase = new GetOrderUseCase(orderRepository);
  });

  it('pedido existente del propio negocio: devuelve la vista con el teléfono del cliente', async () => {
    const view: OrderView = {
      order: Order.reconstitute({
        id: 'order-1',
        businessId: 'business-1',
        conversationId: 'conversation-1',
        status: OrderStatus.PENDING,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      customerPhone: '+573001112233',
    };
    orderRepository.findViewById.mockResolvedValue(view);

    const result = await useCase.execute('order-1', 'business-1');

    expect(result).toBe(view);
    expect(result.customerPhone).toBe('+573001112233');
    expect(orderRepository.findViewById).toHaveBeenCalledWith(
      'order-1',
      'business-1',
    );
  });

  it('pedido inexistente: lanza OrderNotFoundError', async () => {
    orderRepository.findViewById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', 'business-1')).rejects.toThrow(
      OrderNotFoundError,
    );
  });

  it('pedido de otro negocio (el repositorio filtra por negocio y devuelve null): lanza OrderNotFoundError', async () => {
    orderRepository.findViewById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', 'business-2')).rejects.toThrow(
      OrderNotFoundError,
    );

    expect(orderRepository.findViewById).toHaveBeenCalledWith(
      'order-1',
      'business-2',
    );
  });
});
