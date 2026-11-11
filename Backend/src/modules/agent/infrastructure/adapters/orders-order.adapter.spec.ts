import { jest } from '@jest/globals';
import { OrdersOrderAdapter } from './orders-order.adapter';
import { CreateOrderUseCase } from '../../../orders/application/use-cases/create-order.use-case';
import { Order } from '../../../orders/domain/entities/order.entity';
import { OrderItem } from '../../../orders/domain/entities/order-item.entity';
import {
  ConversationAlreadyHasOrderError,
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

  it('orden creada: CREATED con ítems desde el snapshot del pedido, total y rechazados mapeados', async () => {
    const order = anOrder();
    createOrderUseCase.execute.mockResolvedValue({
      order,
      rejectedItems: [{ productId: 'otro', reason: 'UNAVAILABLE' }],
    });

    const result = await adapter.createOrder(command);

    expect(result).toEqual({
      kind: 'CREATED',
      orderId: order.id,
      total: 30000,
      items: [{ productId, name: 'Hamburguesa clásica', quantity: 2, unitPrice: 15000 }],
      rejectedItems: [{ productId: 'otro', reason: 'UNAVAILABLE' }],
    });
  });

  it('orden nula con rechazos: NO_VALID_ITEMS con los rechazos intactos', async () => {
    createOrderUseCase.execute.mockResolvedValue({
      order: null,
      rejectedItems: [
        { productId, reason: 'NOT_FOUND' },
        { productId: 'x', reason: 'INVALID_QUANTITY' },
      ],
    });

    const result = await adapter.createOrder(command);

    expect(result).toEqual({
      kind: 'NO_VALID_ITEMS',
      rejectedItems: [
        { productId, reason: 'NOT_FOUND' },
        { productId: 'x', reason: 'INVALID_QUANTITY' },
      ],
    });
  });

  it('un pedido de total 0 sigue siendo CREATED con total 0', async () => {
    createOrderUseCase.execute.mockResolvedValue({
      order: anOrder(0),
      rejectedItems: [],
    });

    const result = await adapter.createOrder(command);

    expect(result).toMatchObject({ kind: 'CREATED', total: 0 });
  });

  it('traduce SOLO ConversationAlreadyHasOrderError a CONVERSATION_ALREADY_HAS_ORDER, con el id del pedido existente', async () => {
    createOrderUseCase.execute.mockRejectedValue(new ConversationAlreadyHasOrderError('existing-order-id'));

    await expect(adapter.createOrder(command)).resolves.toEqual({
      kind: 'CONVERSATION_ALREADY_HAS_ORDER',
      orderId: 'existing-order-id',
    });
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
