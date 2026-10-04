import { CancelOrderUseCase } from './cancel-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import {
  OrderNotFoundError,
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
    Order.create({
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
      findAllByBusinessId: jest.fn(),
      save: jest.fn(),
    };

    useCase = new CancelOrderUseCase(orderRepository);
  });

  it('pedido PENDING: lo cancela y lo persiste', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));

    const result = await useCase.execute(command);

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
  });

  it('pedido CONFIRMED: también se puede cancelar', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.CONFIRMED));

    const result = await useCase.execute(command);

    expect(result.status).toBe(OrderStatus.CANCELLED);
  });

  it('pedido inexistente: lanza OrderNotFoundError', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(OrderNotFoundError);

    expect(orderRepository.save).not.toHaveBeenCalled();
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

    await expect(useCase.execute(command)).rejects.toThrow(OrderNotFoundError);
  });

  it('pedido ya CANCELLED: lanza InvalidOrderTransitionError y no vuelve a guardar', async () => {
    orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.CANCELLED));

    await expect(useCase.execute(command)).rejects.toThrow(
      InvalidOrderTransitionError,
    );

    expect(orderRepository.save).not.toHaveBeenCalled();
  });
});
