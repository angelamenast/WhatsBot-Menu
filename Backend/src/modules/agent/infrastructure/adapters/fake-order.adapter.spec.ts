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

  it('cumple el contrato del puerto: orderId, total y rejectedItems vacío', async () => {
    const result = await new FakeOrderProvider().createOrder({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    expect(typeof result.orderId).toBe('string');
    expect(result.total).toBe(0);
    expect(result.rejectedItems).toEqual([]);
  });
});
