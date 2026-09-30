import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { CreateOrderCommand, CreateOrderResult, OrderPort } from '../../application/ports/out/order.port';

interface ProductoRow {
  id: string;
  nombre: string;
  precio: number;
}

/**
 * Implementación provisional de OrderPort mientras no exista PedidosModule.
 * Escribe directo a `pedidos`/`pedido_items`. Cuando el equipo asigne y construya
 * PedidosModule, este adapter se retira y se reemplaza por uno que llame a su
 * caso de uso real — ProcessCustomerMessageUseCase no se entera del cambio.
 */
@Injectable()
export class SupabaseOrderAdapter implements OrderPort {
  private readonly logger = new Logger(SupabaseOrderAdapter.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async createOrder(command: CreateOrderCommand): Promise<CreateOrderResult> {
    const client = this.supabaseService.getClient();

    if (command.items.length === 0) {
      throw new Error('No se puede crear un pedido sin items');
    }

    const productIds = command.items.map((item) => item.productId);

    const { data: productos, error: productosError } = await client
      .from('catalogo_productos')
      .select('id, nombre, precio')
      .in('id', productIds)
      .returns<ProductoRow[]>();

    if (productosError) {
      throw productosError;
    }

    const productoById = new Map((productos ?? []).map((p) => [p.id, p]));

    const itemsConPrecio = command.items.map((item) => {
      const producto = productoById.get(item.productId);
      if (!producto) {
        throw new Error(`Producto ${item.productId} no encontrado en el catálogo del negocio`);
      }
      return {
        producto_id: producto.id,
        nombre_producto_snapshot: producto.nombre,
        precio_unitario: producto.precio,
        cantidad: item.quantity,
      };
    });

    const total = itemsConPrecio.reduce((acc, item) => acc + item.precio_unitario * item.cantidad, 0);

    const { data: pedido, error: pedidoError } = await client
      .from('pedidos')
      .insert({ negocio_id: command.businessId, conversacion_id: command.conversationId, total })
      .select('id')
      .single();

    if (pedidoError) {
      throw pedidoError;
    }

    const { error: itemsError } = await client
      .from('pedido_items')
      .insert(itemsConPrecio.map((item) => ({ ...item, pedido_id: pedido.id })));

    if (itemsError) {
      // El pedido quedó creado sin items: se loguea para revisión manual en esta
      // primera versión (sin transacciones multi-tabla desde el cliente de Supabase-js).
      this.logger.error(
        `Pedido ${pedido.id} creado pero fallaron sus items: ${itemsError.message}. Requiere revisión manual.`,
      );
      throw itemsError;
    }

    return { orderId: pedido.id, total };
  }
}