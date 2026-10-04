import { ListOrdersByBusinessUseCase } from './list-orders-by-business.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';

describe('ListOrdersByBusinessUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let useCase: ListOrdersByBusinessUseCase;

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findAllByBusinessId: jest.fn(),
      save: jest.fn(),
    };

    useCase = new ListOrdersByBusinessUseCase(orderRepository);
  });

  it('delega directamente en el repositorio con el businessId recibido', async () => {
    const orders = [
      Order.create({
        id: 'order-1',
        businessId: 'business-1',
        conversationId: 'conversation-1',
        status: OrderStatus.PENDING,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ];
    orderRepository.findAllByBusinessId.mockResolvedValue(orders);

    const result = await useCase.execute('business-1');

    expect(orderRepository.findAllByBusinessId).toHaveBeenCalledWith(
      'business-1',
    );
    expect(result).toBe(orders);
  });

  it('negocio sin pedidos: devuelve lista vacía', async () => {
    orderRepository.findAllByBusinessId.mockResolvedValue([]);

    const result = await useCase.execute('business-1');

    expect(result).toEqual([]);
  });
});
