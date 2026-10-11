import {
  BadRequestException,
  Controller,
  ConflictException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../../../auth/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { ListOrdersByBusinessUseCase } from '../../application/use-cases/list-orders-by-business.use-case';
import { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';
import { CancelOrderUseCase } from '../../application/use-cases/cancel-order.use-case';
import { ConfirmOrderUseCase } from '../../application/use-cases/confirm-order.use-case';
import {
  InvalidOrderListFilterError,
  OrderNotFoundError,
  OrderStateConflictError,
  InvalidOrderTransitionError,
} from '../../domain/errors/order.errors';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import {
  OrderDetailResponse,
  OrderListResponse,
  OrderResponse,
  toOrderDetailResponse,
  toOrderListResponse,
  toOrderResponse,
} from '../dto/order-response.dto';

// El límite global (10/min) es demasiado bajo para un dashboard que lista y consulta pedidos.
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('orders')
@UseGuards(SupabaseAuthGuard)
export class OrdersController {
  constructor(
    private readonly listOrdersByBusinessUseCase: ListOrdersByBusinessUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly cancelOrderUseCase: CancelOrderUseCase,
    private readonly confirmOrderUseCase: ConfirmOrderUseCase,
    private readonly businessService: BusinessService,
  ) {}

  @Get()
  async list(
    @Req() request: Request & { user: { id: string } },
    // El ValidationPipe global no tiene transform: sin este pipe local limit y
    // offset llegarían como strings y los defaults del DTO no se aplicarían.
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListOrdersQueryDto,
  ): Promise<OrderListResponse> {
    const business = await this.resolveBusiness(request.user.id);

    try {
      const page = await this.listOrdersByBusinessUseCase.execute({
        businessId: business.id,
        from: query.from,
        to: query.to,
        limit: query.limit,
        offset: query.offset,
      });
      return toOrderListResponse(page, query.limit, query.offset);
    } catch (error) {
      if (error instanceof InvalidOrderListFilterError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(':id')
  async getOne(
    @Req() request: Request & { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDetailResponse> {
    const business = await this.resolveBusiness(request.user.id);

    try {
      const view = await this.getOrderUseCase.execute(id, business.id);
      return toOrderDetailResponse(view);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/confirm')
  async confirm(
    @Req() request: Request & { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    const business = await this.resolveBusiness(request.user.id);

    try {
      const order = await this.confirmOrderUseCase.execute({
        orderId: id,
        businessId: business.id,
        action: 'CONFIRM',
      });
      return toOrderResponse(order);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof InvalidOrderTransitionError ||
        error instanceof OrderStateConflictError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/cancel')
  async cancel(
    @Req() request: Request & { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    const business = await this.resolveBusiness(request.user.id);

    try {
      const order = await this.cancelOrderUseCase.execute({
        orderId: id,
        businessId: business.id,
        action: 'CANCEL',
      });
      return toOrderResponse(order);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof InvalidOrderTransitionError ||
        error instanceof OrderStateConflictError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async resolveBusiness(usuarioId: string) {
    const business = await this.businessService.findByUsuario(usuarioId);

    if (!business) {
      throw new NotFoundException('No tienes un negocio registrado');
    }

    return business;
  }
}
