import { ConfirmOrderUseCase } from './confirm-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import {
  OrderNotFoundError,
  InvalidOrderTransitionError,
} from '../../domain/errors/order.errors';
import { UpdateOrderStatusCommand } from '../dto/update-order-status.command';

describe('ConfirmOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let useCase: ConfirmOrderUseCase;

  const command: UpdateOrderStatusCommand = {
    orderId: 'order-1',
    businessId: 'business-1',
    action: 'CONFIRM',
  };

  const aPendingOrder = () =>
    Order.create({
      id: 'order-1',
      businessId: 'business-1',
      conversationId: 'conversation-1',
      status: OrderStatus.PENDING,
      items: [
        OrderItem.create({
          productId: 'product-1',
          productNameSnapshot: 'Hamburguesa clásica',
          unitPrice: 15000,
          quantity: 1,
        }),
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findAllByBusinessId: jest.fn(),
      save: jest.fn(),
    };

    useCase = new ConfirmOrderUseCase(orderRepository);
  });

  it('pedido PENDING del propio negocio: lo confirma y lo persiste', async () => {
    orderRepository.findById.mockResolvedValue(aPendingOrder());

    const result = await useCase.execute(command);

    expect(result.status).toBe(OrderStatus.CONFIRMED);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(orderRepository.save.mock.calls[0][0].status).toBe(
      OrderStatus.CONFIRMED,
    );
  });

  it('pedido inexistente: lanza OrderNotFoundError y no guarda', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(OrderNotFoundError);

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('pedido de otro negocio: lanza OrderNotFoundError (no revela que el pedido existe)', async () => {
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

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('pedido ya CONFIRMED: lanza InvalidOrderTransitionError y no vuelve a guardar', async () => {
    const order = aPendingOrder();
    order.confirm();
    orderRepository.findById.mockResolvedValue(order);

    await expect(useCase.execute(command)).rejects.toThrow(
      InvalidOrderTransitionError,
    );

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('pedido CANCELLED: lanza InvalidOrderTransitionError', async () => {
    const order = aPendingOrder();
    order.cancel();
    orderRepository.findById.mockResolvedValue(order);

    await expect(useCase.execute(command)).rejects.toThrow(
      InvalidOrderTransitionError,
    );
  });
});
