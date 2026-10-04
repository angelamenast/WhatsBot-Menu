import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { OrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderMapper } from './order.mapper';

const PEDIDO_CON_ITEMS_SELECT = '*, pedido_items(*)';

@Injectable()
export class SupabaseOrderRepository implements OrderRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(id: string): Promise<Order | null> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .select(PEDIDO_CON_ITEMS_SELECT)
      .eq('id', id)
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

  async save(order: Order): Promise<void> {
    const client = this.supabaseService.getClient();

    // Los items de un pedido nunca cambian después de creado (Order no expone
    // ningún método para modificarlos) — createdAt === updatedAt identifica de
    // forma confiable "este es el primer save", el único momento en que hace
    // falta escribir pedido_items. Guardados posteriores (ej. confirm()/cancel())
    // solo tocan la fila de `pedidos`.
    const isFirstSave = order.createdAt.getTime() === order.updatedAt.getTime();

    const { error: pedidoError } = await client
      .from('pedidos')
      .upsert(OrderMapper.toPedidoRow(order));

    if (pedidoError) {
      throw pedidoError;
    }

    if (isFirstSave) {
      const { error: itemsError } = await client
        .from('pedido_items')
        .insert(OrderMapper.toPedidoItemRows(order));

      if (itemsError) {
        // Sin transacciones multi-tabla desde supabase-js: si esto falla, el
        // pedido queda creado sin items. Requiere revisión manual — mismo
        // caveat documentado en el adapter provisional que tuvo `agent`.
        throw itemsError;
      }
    }
  }
}
