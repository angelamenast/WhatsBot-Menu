import { GetOrderUseCase } from './get-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderNotFoundError } from '../../domain/errors/order.errors';

describe('GetOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let useCase: GetOrderUseCase;

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findAllByBusinessId: jest.fn(),
      save: jest.fn(),
    };

    useCase = new GetOrderUseCase(orderRepository);
  });

  it('pedido existente del propio negocio: lo devuelve', async () => {
    const order = Order.create({
      id: 'order-1',
      businessId: 'business-1',
      conversationId: 'conversation-1',
      status: OrderStatus.PENDING,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orderRepository.findById.mockResolvedValue(order);

    const result = await useCase.execute('order-1', 'business-1');

    expect(result).toBe(order);
  });

  it('pedido inexistente: lanza OrderNotFoundError', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', 'business-1')).rejects.toThrow(
      OrderNotFoundError,
    );
  });

  it('pedido de otro negocio: lanza OrderNotFoundError', async () => {
    const otherBusinessOrder = Order.create({
      id: 'order-1',
      businessId: 'business-2',
      conversationId: 'conversation-1',
      status: OrderStatus.PENDING,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orderRepository.findById.mockResolvedValue(otherBusinessOrder);

    await expect(useCase.execute('order-1', 'business-1')).rejects.toThrow(
      OrderNotFoundError,
    );
  });
});
