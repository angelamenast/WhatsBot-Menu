import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { CancelOrderUseCase } from './cancel-order.use-case';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { OrderEventsPort } from '../ports/out/order-events.port';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import {
  OrderNotFoundError,
  OrderStateConflictError,
  InvalidOrderTransitionError,
} from '../../domain/errors/order.errors';
import { UpdateOrderStatusCommand } from '../dto/update-order-status.command';

describe('CancelOrderUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let orderEvents: jest.Mocked<OrderEventsPort>;
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
      items: [
        OrderItem.create({
          productId: 'product-1',
          productNameSnapshot: 'Hamburguesa clásica',
          unitPrice: 15000,
          quantity: 2,
        }),
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findViewById: jest.fn(),
      findViewsByBusiness: jest.fn(),
      findOpenByConversation: jest.fn(),
      insert: jest.fn(),
      updateStatus: jest.fn(),
    };

    orderEvents = { publishStatusChanged: jest.fn() };

    useCase = new CancelOrderUseCase(orderRepository, orderEvents);
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

  describe('notificación del cambio de estado', () => {
    const expectedEvent = (order: Order) => ({
      orderId: 'order-1',
      businessId: 'business-1',
      conversationId: 'conversation-1',
      status: 'CANCELLED',
      total: 30000,
      occurredAt: order.updatedAt,
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('publica el evento una sola vez, con el payload correcto, después de actualizar', async () => {
      orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));
      orderRepository.updateStatus.mockResolvedValue(true);

      const result = await useCase.execute(command);

      expect(orderEvents.publishStatusChanged).toHaveBeenCalledTimes(1);
      expect(orderEvents.publishStatusChanged).toHaveBeenCalledWith(
        expectedEvent(result),
      );
      // el evento sale DESPUÉS de persistir
      expect(
        orderRepository.updateStatus.mock.invocationCallOrder[0],
      ).toBeLessThan(orderEvents.publishStatusChanged.mock.invocationCallOrder[0]);
    });

    it('con conflicto de concurrencia (updateStatus false → 409) NO publica', async () => {
      orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));
      orderRepository.updateStatus.mockResolvedValue(false);

      await expect(useCase.execute(command)).rejects.toThrow(
        OrderStateConflictError,
      );

      expect(orderEvents.publishStatusChanged).not.toHaveBeenCalled();
    });

    it('si el pedido no existe NO publica', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(command)).rejects.toThrow(OrderNotFoundError);

      expect(orderEvents.publishStatusChanged).not.toHaveBeenCalled();
    });

    it('si el puerto de eventos lanza, el caso de uso igual devuelve el pedido y registra un warning solo con ids', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      orderRepository.findById.mockResolvedValue(anOrder(OrderStatus.PENDING));
      orderRepository.updateStatus.mockResolvedValue(true);
      orderEvents.publishStatusChanged.mockImplementation(() => {
        throw new Error('bus caído');
      });

      const result = await useCase.execute(command);

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0][0]);
      expect(message).toContain('order-1');
      expect(message).toContain('business-1');
      expect(message).toContain('bus caído');
    });
  });
});
