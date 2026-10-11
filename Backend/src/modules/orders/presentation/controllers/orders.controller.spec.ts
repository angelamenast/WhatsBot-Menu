import 'reflect-metadata';
import { ExecutionContext, INestApplication } from '@nestjs/common';
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
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderStateConflictError,
} from '../../domain/errors/order.errors';

describe('OrdersController', () => {
  let app: INestApplication<App>;
  let getOrderUseCase: { execute: jest.Mock };
  let confirmOrderUseCase: { execute: jest.Mock };
  let cancelOrderUseCase: { execute: jest.Mock };

  const orderId = '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77';
  const business = { id: 'business-1' };

  const anOrder = (status = OrderStatus.CONFIRMED) =>
    Order.reconstitute({
      id: orderId,
      businessId: 'business-1',
      conversationId: 'conversation-1',
      status,
      items: [],
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-01T10:00:00Z'),
    });

  beforeEach(async () => {
    getOrderUseCase = { execute: jest.fn() };
    confirmOrderUseCase = { execute: jest.fn() };
    cancelOrderUseCase = { execute: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: ListOrdersByBusinessUseCase,
          useValue: { execute: jest.fn().mockResolvedValue([]) },
        },
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
      getOrderUseCase.execute.mockResolvedValue(anOrder());

      await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(200);

      expect(getOrderUseCase.execute).toHaveBeenCalledWith(orderId, 'business-1');
    });
  });

  describe('códigos HTTP', () => {
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

    it('cancel: éxito → 200 con el pedido en CANCELLED', async () => {
      cancelOrderUseCase.execute.mockResolvedValue(
        anOrder(OrderStatus.CANCELLED),
      );

      const response = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/cancel`)
        .expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });
  });

  describe('throttling', () => {
    it('sobrescribe el límite global con 60 req/min para todo el controller', () => {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', OrdersController)).toBe(
        60,
      );
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', OrdersController)).toBe(
        60000,
      );
    });
  });
});
