import {
  Controller,
  ConflictException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../../../auth/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { ListOrdersByBusinessUseCase } from '../../application/use-cases/list-orders-by-business.use-case';
import { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';
import { CancelOrderUseCase } from '../../application/use-cases/cancel-order.use-case';
import { ConfirmOrderUseCase } from '../../application/use-cases/confirm-order.use-case';
import {
  OrderNotFoundError,
  InvalidOrderTransitionError,
} from '../../domain/errors/order.errors';
import { OrderResponse, toOrderResponse } from '../dto/order-response.dto';

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
  ): Promise<OrderResponse[]> {
    const business = await this.resolveBusiness(request.user.id);
    const orders = await this.listOrdersByBusinessUseCase.execute(business.id);
    return orders.map(toOrderResponse);
  }

  @Get(':id')
  async getOne(
    @Req() request: Request & { user: { id: string } },
    @Param('id') id: string,
  ): Promise<OrderResponse> {
    const business = await this.resolveBusiness(request.user.id);

    try {
      const order = await this.getOrderUseCase.execute(id, business.id);
      return toOrderResponse(order);
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
    @Param('id') id: string,
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
      if (error instanceof InvalidOrderTransitionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/cancel')
  async cancel(
    @Req() request: Request & { user: { id: string } },
    @Param('id') id: string,
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
      if (error instanceof InvalidOrderTransitionError) {
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
