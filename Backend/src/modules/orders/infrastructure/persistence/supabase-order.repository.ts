import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import {
  ConversationNotInBusinessError,
  EmptyOrderError,
} from '../../domain/errors/order.errors';
import { OrderMapper } from './order.mapper';

const PEDIDO_CON_ITEMS_SELECT = '*, pedido_items(*)';

// Marcadores que lanza la función SQL crear_pedido con RAISE EXCEPTION.
const RPC_CONVERSATION_NOT_IN_BUSINESS = 'CONVERSATION_NOT_IN_BUSINESS';
const RPC_ORDER_WITHOUT_ITEMS = 'ORDER_WITHOUT_ITEMS';

@Injectable()
export class SupabaseOrderRepository implements OrderRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(orderId: string, businessId: string): Promise<Order | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .select(PEDIDO_CON_ITEMS_SELECT)
      .eq('id', orderId)
      .eq('negocio_id', businessId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? OrderMapper.toDomain(data) : null;
  }

  async findAllByBusinessId(businessId: string): Promise<Order[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .select(PEDIDO_CON_ITEMS_SELECT)
      .eq('negocio_id', businessId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => OrderMapper.toDomain(row));
  }

  async insert(order: Order): Promise<void> {
    const client = this.supabaseService.getClient();

    // Una sola llamada = una sola transacción en Postgres: pedido e items se
    // crean juntos o no se crea nada (no quedan pedidos huérfanos).
    const { error } = await client.rpc(
      'crear_pedido',
      OrderMapper.toCrearPedidoParams(order),
    );

    if (error) {
      if (error.message?.includes(RPC_CONVERSATION_NOT_IN_BUSINESS)) {
        throw new ConversationNotInBusinessError(
          order.conversationId,
          order.businessId,
        );
      }
      if (error.message?.includes(RPC_ORDER_WITHOUT_ITEMS)) {
        throw new EmptyOrderError();
      }
      throw error;
    }
  }

  async updateStatus(
    orderId: string,
    businessId: string,
    expectedStatus: OrderStatus,
    newStatus: OrderStatus,
    updatedAt: Date,
  ): Promise<boolean> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .update({
        estado_codigo: OrderMapper.toEstadoCodigo(newStatus),
        updated_at: updatedAt.toISOString(),
      })
      .eq('id', orderId)
      .eq('negocio_id', businessId)
      .eq('estado_codigo', OrderMapper.toEstadoCodigo(expectedStatus))
      .select('id');

    if (error) {
      throw error;
    }

    return (data?.length ?? 0) === 1;
  }
}
