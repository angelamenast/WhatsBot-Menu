import { CancelOrderUseCase } from './cancel-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import {
  OrderNotFoundError,
  OrderStateConflictError,
  InvalidOrderTransitionError,
} from '../../domain/errors/order.errors';
import { UpdateOrderStatusCommand } from '../dto/update-order-status.command';

describe('CancelOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let useCase: CancelOrderUseCase;

  const command: UpdateOrderStatusCommand = {
    orderId: 'order-1',
    businessId: 'business-1',
    action: 'CANCEL',
  };

  const anOrder = (status: OrderStatus) =>
    Order.reconstitute({
      id: 'order-1',
      businessId: 'business-1',
      conversationId: 'conversation-1',
      status,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findViewById: jest.fn(),
      findViewsByBusiness: jest.fn(),
      insert: jest.fn(),
      updateStatus: jest.fn(),
    };

    useCase = new CancelOrderUseCase(orderRepository);
  });

  it('pedido PENDING: lo cancela con compare-and-set desde PENDING', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));
    orderRepository.updateStatus.mockResolvedValue(true);

    const result = await useCase.execute(command);

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(
      'order-1',
      'business-1',
      OrderStatus.PENDING,
      OrderStatus.CANCELLED,
      result.updatedAt,
    );
  });

  it('pedido CONFIRMED: también se puede cancelar, esperando CONFIRMED como estado previo', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.CONFIRMED));
    orderRepository.updateStatus.mockResolvedValue(true);

    const result = await useCase.execute(command);

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(orderRepository.updateStatus).toHaveBeenCalledWith(
      'order-1',
      'business-1',
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
      result.updatedAt,
    );
  });

  it('consulta el pedido filtrando por el negocio del comando', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));
    orderRepository.updateStatus.mockResolvedValue(true);

    await useCase.execute(command);

    expect(orderRepository.findById).toHaveBeenCalledWith(
      'order-1',
      'business-1',
    );
  });

  it('pedido inexistente (o de otro negocio): lanza OrderNotFoundError y no escribe', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(OrderNotFoundError);

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('otro proceso cambió el estado entre la lectura y la escritura: lanza OrderStateConflictError', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));
    orderRepository.updateStatus.mockResolvedValue(false);

    await expect(useCase.execute(command)).rejects.toThrow(
      OrderStateConflictError,
    );
  });

  it('pedido ya CANCELLED: lanza InvalidOrderTransitionError y no escribe', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.CANCELLED));

    await expect(useCase.execute(command)).rejects.toThrow(
      InvalidOrderTransitionError,
    );

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });
});
