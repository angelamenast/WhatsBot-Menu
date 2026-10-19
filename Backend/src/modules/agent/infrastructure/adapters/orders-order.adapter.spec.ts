import { jest } from '@jest/globals';
import { OrdersOrderAdapter } from './orders-order.adapter';
import { CreateOrderUseCase } from '../../../orders/application/use-cases/create-order.use-case';
import { Order } from '../../../orders/domain/entities/order.entity';
import { OrderItem } from '../../../orders/domain/entities/order-item.entity';
import {
  ConversationNotInBusinessError,
  EmptyOrderError,
} from '../../../orders/domain/errors/order.errors';

type AnyFn = (...args: any[]) => any;

describe('OrdersOrderAdapter', () => {
  let createOrderUseCase: { execute: jest.Mock<AnyFn> };
  let adapter: OrdersOrderAdapter;

  const productId = '11111111-1111-4111-8111-111111111111';
  const command = {
    businessId: 'business-1',
    conversationId: 'conversation-1',
    items: [{ productId, quantity: 2 }],
  };

  const anOrder = (unitPrice = 15000) =>
    Order.createPending({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      items: [
        OrderItem.create({
          productId,
          productNameSnapshot: 'Hamburguesa clásica',
          unitPrice,
          quantity: 2,
        }),
      ],
    });

  beforeEach(() => {
    createOrderUseCase = { execute: jest.fn<AnyFn>() };
    adapter = new OrdersOrderAdapter(
      createOrderUseCase as unknown as CreateOrderUseCase,
    );
  });

  it('traduce el comando hacia orders (solo businessId, conversationId e ítems)', async () => {
    createOrderUseCase.execute.mockResolvedValue({
      order: anOrder(),
      rejectedItems: [],
    });

    await adapter.createOrder(command);

    expect(createOrderUseCase.execute).toHaveBeenCalledWith({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      items: [{ productId, quantity: 2 }],
    });
  });

  it('orden creada: devuelve orderId y total, con rechazados mapeados', async () => {
    const order = anOrder();
    createOrderUseCase.execute.mockResolvedValue({
      order,
      rejectedItems: [{ productId: 'otro', reason: 'UNAVAILABLE' }],
    });

    const result = await adapter.createOrder(command);

    expect(result).toEqual({
      orderId: order.id,
      total: 30000,
      rejectedItems: [{ productId: 'otro', reason: 'UNAVAILABLE' }],
    });
  });

  it('orden nula con rechazos: orderId y total en null y los rechazos intactos', async () => {
    createOrderUseCase.execute.mockResolvedValue({
      order: null,
      rejectedItems: [
        { productId, reason: 'NOT_FOUND' },
        { productId: 'x', reason: 'INVALID_QUANTITY' },
      ],
    });

    const result = await adapter.createOrder(command);

    expect(result).toEqual({
      orderId: null,
      total: null,
      rejectedItems: [
        { productId, reason: 'NOT_FOUND' },
        { productId: 'x', reason: 'INVALID_QUANTITY' },
      ],
    });
  });

  it('un pedido de total 0 devuelve total 0 (no null)', async () => {
    createOrderUseCase.execute.mockResolvedValue({
      order: anOrder(0),
      rejectedItems: [],
    });

    const result = await adapter.createOrder(command);

    expect(result.total).toBe(0);
    expect(result.orderId).not.toBeNull();
  });

  it.each([
    ['EmptyOrderError', new EmptyOrderError()],
    [
      'ConversationNotInBusinessError',
      new ConversationNotInBusinessError('conversation-1', 'business-1'),
    ],
    ['error de infraestructura', new Error('db caída')],
  ])('propaga %s sin capturarlo', async (_label, error) => {
    createOrderUseCase.execute.mockRejectedValue(error);

    await expect(adapter.createOrder(command)).rejects.toBe(error);
  });
});
