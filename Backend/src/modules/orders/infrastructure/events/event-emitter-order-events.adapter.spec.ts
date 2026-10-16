import { jest } from '@jest/globals';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterOrderEventsAdapter } from './event-emitter-order-events.adapter';
import {
  ORDER_STATUS_CHANGED_EVENT,
  OrderStatusChangedEvent,
} from '../../../../shared/events/order-status-changed.event';

type AnyFn = (...args: any[]) => any;

describe('EventEmitterOrderEventsAdapter', () => {
  let eventEmitter: { emit: jest.Mock<AnyFn>; emitAsync: jest.Mock<AnyFn> };
  let adapter: EventEmitterOrderEventsAdapter;

  const event: OrderStatusChangedEvent = {
    orderId: 'order-1',
    businessId: 'business-1',
    conversationId: 'conversation-1',
    status: 'CONFIRMED',
    total: 15000,
    occurredAt: new Date('2026-10-15T10:00:00Z'),
  };

  beforeEach(() => {
    eventEmitter = { emit: jest.fn<AnyFn>(), emitAsync: jest.fn<AnyFn>() };
    adapter = new EventEmitterOrderEventsAdapter(
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('emite order.status_changed con el payload tal cual', () => {
    adapter.publishStatusChanged(event);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      ORDER_STATUS_CHANGED_EVENT,
      event,
    );
  });

  it('usa emit y NO emitAsync: no espera a los listeners', () => {
    adapter.publishStatusChanged(event);

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('el nombre del evento es order.status_changed', () => {
    expect(ORDER_STATUS_CHANGED_EVENT).toBe('order.status_changed');
  });

  it('el evento no lleva teléfono ni texto', () => {
    adapter.publishStatusChanged(event);

    const payload = eventEmitter.emit.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'businessId',
      'conversationId',
      'occurredAt',
      'orderId',
      'status',
      'total',
    ]);
  });
});
