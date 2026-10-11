import 'reflect-metadata';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrdersController } from './orders.controller';
import { SupabaseAuthGuard } from '../../../auth/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { ListOrdersByBusinessUseCase } from '../../application/use-cases/list-orders-by-business.use-case';
import { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';
import { CancelOrderUseCase } from '../../application/use-cases/cancel-order.use-case';
import { ConfirmOrderUseCase } from '../../application/use-cases/confirm-order.use-case';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import {
  InvalidOrderListFilterError,
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderStateConflictError,
} from '../../domain/errors/order.errors';

describe('OrdersController', () => {
  let app: INestApplication<App>;
  let listOrdersUseCase: { execute: jest.Mock };
  let getOrderUseCase: { execute: jest.Mock };
  let confirmOrderUseCase: { execute: jest.Mock };
  let cancelOrderUseCase: { execute: jest.Mock };

  const orderId = '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77';
  const business = { id: 'business-1' };
  const phone = '+573001112233';

  const anOrder = (status = OrderStatus.CONFIRMED) =>
    Order.reconstitute({
      id: orderId,
      businessId: 'business-1',
      conversationId: 'conversation-1',
      status,
      items: [
        OrderItem.reconstitute({
          productId: null,
          productNameSnapshot: 'Producto retirado',
          unitPrice: 8000,
          quantity: 2,
        }),
      ],
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-01T10:00:00Z'),
    });

  const aView = () => ({ order: anOrder(), customerPhone: phone });

  beforeEach(async () => {
    listOrdersUseCase = {
      execute: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    getOrderUseCase = { execute: jest.fn() };
    confirmOrderUseCase = { execute: jest.fn() };
    cancelOrderUseCase = { execute: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: ListOrdersByBusinessUseCase, useValue: listOrdersUseCase },
        { provide: GetOrderUseCase, useValue: getOrderUseCase },
        { provide: ConfirmOrderUseCase, useValue: confirmOrderUseCase },
        { provide: CancelOrderUseCase, useValue: cancelOrderUseCase },
        {
          provide: BusinessService,
          useValue: { findByUsuario: jest.fn().mockResolvedValue(business) },
        },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    // Igual que main.ts: pipe global SIN transform.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe(':id debe ser un UUID', () => {
    it.each([
      ['GET', '/orders/not-a-uuid'],
      ['PATCH', '/orders/not-a-uuid/confirm'],
      ['PATCH', '/orders/not-a-uuid/cancel'],
    ])('%s %s → 400 sin llegar al caso de uso', async (method, url) => {
      const server = app.getHttpServer();
      const req =
        method === 'GET' ? request(server).get(url) : request(server).patch(url);

      await req.expect(400);

      expect(getOrderUseCase.execute).not.toHaveBeenCalled();
      expect(confirmOrderUseCase.execute).not.toHaveBeenCalled();
      expect(cancelOrderUseCase.execute).not.toHaveBeenCalled();
    });

    it('un UUID válido sí llega al caso de uso con el negocio del usuario autenticado', async () => {
      getOrderUseCase.execute.mockResolvedValue(aView());

      await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(200);

      expect(getOrderUseCase.execute).toHaveBeenCalledWith(orderId, 'business-1');
    });
  });

  describe('GET /orders/:id', () => {
    it('incluye el teléfono del cliente y productId nulo cuando el producto fue eliminado', async () => {
      getOrderUseCase.execute.mockResolvedValue(aView());

      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .expect(200);

      expect(response.body.customerPhone).toBe(phone);
      expect(response.body.items[0].productId).toBeNull();
      expect(response.body.items[0].productName).toBe('Producto retirado');
      expect(response.body.total).toBe(16000);
    });

    it('pedido inexistente o de otro negocio → 404', async () => {
      getOrderUseCase.execute.mockRejectedValue(new OrderNotFoundError(orderId));

      await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(404);
    });
  });

  describe('GET /orders', () => {
    it('devuelve el envelope { data, total, limit, offset } con teléfono en cada pedido', async () => {
      listOrdersUseCase.execute.mockResolvedValue({
        items: [aView()],
        total: 57,
      });

      const response = await request(app.getHttpServer())
        .get('/orders?limit=10&offset=20')
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual([
        'data',
        'limit',
        'offset',
        'total',
      ]);
      expect(response.body.total).toBe(57);
      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(20);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].customerPhone).toBe(phone);
    });

    it('sin query: el caso de uso recibe limit=20 y offset=0 como NÚMEROS (pipe local con transform)', async () => {
      await request(app.getHttpServer()).get('/orders').expect(200);

      const command = listOrdersUseCase.execute.mock.calls[0][0];
      expect(command).toEqual({
        businessId: 'business-1',
        from: undefined,
        to: undefined,
        limit: 20,
        offset: 0,
      });
      expect(typeof command.limit).toBe('number');
      expect(typeof command.offset).toBe('number');
    });

    it('limit y offset llegan como números y las fechas se pasan tal cual al caso de uso', async () => {
      await request(app.getHttpServer())
        .get('/orders?limit=5&offset=10&from=2026-10-01&to=2026-10-10')
        .expect(200);

      expect(listOrdersUseCase.execute).toHaveBeenCalledWith({
        businessId: 'business-1',
        from: '2026-10-01',
        to: '2026-10-10',
        limit: 5,
        offset: 10,
      });
    });

    it('el businessId nunca sale de la query: un businessId enviado se ignora', async () => {
      await request(app.getHttpServer())
        .get('/orders?businessId=otro-negocio')
        .expect(200);

      expect(listOrdersUseCase.execute.mock.calls[0][0].businessId).toBe(
        'business-1',
      );
    });

    it.each([
      'limit=0',
      'limit=101',
      'offset=-1',
      'from=10/10/2026',
      'to=2026-1-5',
    ])('%s → 400 sin llegar al caso de uso', async (query) => {
      await request(app.getHttpServer()).get(`/orders?${query}`).expect(400);

      expect(listOrdersUseCase.execute).not.toHaveBeenCalled();
    });

    it('InvalidOrderListFilterError (fecha inexistente o from > to) → 400', async () => {
      listOrdersUseCase.execute.mockRejectedValue(
        new InvalidOrderListFilterError('"from" no puede ser posterior a "to"'),
      );

      const response = await request(app.getHttpServer())
        .get('/orders?from=2026-10-11&to=2026-10-10')
        .expect(400);

      expect(response.body.message).toContain('posterior');
    });
  });

  describe('PATCH confirm / cancel', () => {
    it('confirm: éxito → 200 con OrderResponse SIN teléfono', async () => {
      confirmOrderUseCase.execute.mockResolvedValue(anOrder());

      const response = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/confirm`)
        .expect(200);

      expect(response.body.status).toBe('CONFIRMED');
      expect(response.body).not.toHaveProperty('customerPhone');
    });

    it('cancel: éxito → 200 con el pedido en CANCELLED y SIN teléfono', async () => {
      cancelOrderUseCase.execute.mockResolvedValue(
        anOrder(OrderStatus.CANCELLED),
      );

      const response = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/cancel`)
        .expect(200);

      expect(response.body.status).toBe('CANCELLED');
      expect(response.body).not.toHaveProperty('customerPhone');
    });

    it('confirm: OrderNotFoundError → 404', async () => {
      confirmOrderUseCase.execute.mockRejectedValue(
        new OrderNotFoundError(orderId),
      );

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/confirm`)
        .expect(404);
    });

    it('confirm: InvalidOrderTransitionError → 409', async () => {
      confirmOrderUseCase.execute.mockRejectedValue(
        new InvalidOrderTransitionError('CANCELLED', 'CONFIRMED'),
      );

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/confirm`)
        .expect(409);
    });

    it('confirm: OrderStateConflictError (carrera) → 409', async () => {
      confirmOrderUseCase.execute.mockRejectedValue(
        new OrderStateConflictError(orderId),
      );

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/confirm`)
        .expect(409);
    });

    it('cancel: OrderStateConflictError (carrera) → 409', async () => {
      cancelOrderUseCase.execute.mockRejectedValue(
        new OrderStateConflictError(orderId),
      );

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/cancel`)
        .expect(409);
    });
  });

  describe('throttling', () => {
    it('sobrescribe el límite global con 60 req/min para todo el controller', () => {
      expect(
        Reflect.getMetadata('THROTTLER:LIMITdefault', OrdersController),
      ).toBe(60);
      expect(
        Reflect.getMetadata('THROTTLER:TTLdefault', OrdersController),
      ).toBe(60000);
    });
  });
});
