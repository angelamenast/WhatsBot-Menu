import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { FakeOrderProvider } from './fake-order.adapter';

describe('FakeOrderProvider', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cumple el contrato del puerto: CREATED con orderId, total 0, ítems y rechazados vacíos', async () => {
    const result = await new FakeOrderProvider().createOrder({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    expect(result.kind).toBe('CREATED');
    if (result.kind !== 'CREATED') {
      throw new Error('se esperaba CREATED');
    }
    expect(typeof result.orderId).toBe('string');
    expect(result.orderId.length).toBeGreaterThan(0);
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.rejectedItems).toEqual([]);
  });

  it('cada llamada genera un orderId distinto', async () => {
    const provider = new FakeOrderProvider();
    const command = { businessId: 'b', conversationId: 'c', items: [{ productId: 'p', quantity: 1 }] };

    const first = await provider.createOrder(command);
    const second = await provider.createOrder(command);

    expect((first as { orderId: string }).orderId).not.toBe((second as { orderId: string }).orderId);
  });
});
