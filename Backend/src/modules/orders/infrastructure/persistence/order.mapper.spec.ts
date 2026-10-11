import { OrderMapper } from './order.mapper';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { UnknownOrderStatusError } from '../../domain/errors/order.errors';

describe('OrderMapper', () => {
  const aRow = (estado_codigo: string, pedido_items: unknown[] = []) =>
    ({
      id: 'order-1',
      negocio_id: 'business-1',
      conversacion_id: 'conversation-1',
      estado_codigo,
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
      pedido_items,
    }) as never;

  describe('toDomain', () => {
    it.each([
      ['pendiente', OrderStatus.PENDING],
      ['confirmado', OrderStatus.CONFIRMED],
      ['cancelado', OrderStatus.CANCELLED],
    ])('estado_codigo "%s" → %s', (estado, status) => {
      expect(OrderMapper.toDomain(aRow(estado)).status).toBe(status);
    });

    it('estado_codigo desconocido: lanza UnknownOrderStatusError en vez de hidratar con undefined', () => {
      expect(() => OrderMapper.toDomain(aRow('en_camino'))).toThrow(
        UnknownOrderStatusError,
      );
    });

    it('estado_codigo igual a una clave heredada de Object ("constructor"): también lanza', () => {
      expect(() => OrderMapper.toDomain(aRow('constructor'))).toThrow(
        UnknownOrderStatusError,
      );
    });

    it('pedido huérfano sin items: se hidrata igual (reconstitute no valida)', () => {
      const order = OrderMapper.toDomain(aRow('pendiente', []));

      expect(order.items).toHaveLength(0);
      expect(order.total).toBe(0);
    });

    it('mapea los items con su snapshot de nombre y precio', () => {
      const order = OrderMapper.toDomain(
        aRow('pendiente', [
          {
            producto_id: 'product-1',
            nombre_producto_snapshot: 'Hamburguesa clásica',
            precio_unitario: 15000,
            cantidad: 2,
          },
        ]),
      );

      expect(order.items[0].productNameSnapshot).toBe('Hamburguesa clásica');
      expect(order.total).toBe(30000);
    });
  });

  describe('toCrearPedidoParams', () => {
    it('envía id, negocio, conversación e items en las columnas reales, sin total ni subtotal', () => {
      const order = Order.createPending({
        businessId: 'business-1',
        conversationId: 'conversation-1',
        items: [
          OrderItem.create({
            productId: 'product-1',
            productNameSnapshot: 'Hamburguesa clásica',
            unitPrice: 15000,
            quantity: 2,
          }),
        ],
      });

      const params = OrderMapper.toCrearPedidoParams(order);

      expect(params).toEqual({
        p_pedido_id: order.id,
        p_negocio_id: 'business-1',
        p_conversacion_id: 'conversation-1',
        p_items: [
          {
            producto_id: 'product-1',
            nombre_producto_snapshot: 'Hamburguesa clásica',
            precio_unitario: 15000,
            cantidad: 2,
          },
        ],
      });
      expect(JSON.stringify(params)).not.toContain('total');
      expect(JSON.stringify(params)).not.toContain('subtotal');
    });
  });

  describe('toEstadoCodigo', () => {
    it('es la inversa de toStatus', () => {
      for (const status of Object.values(OrderStatus)) {
        expect(OrderMapper.toStatus(OrderMapper.toEstadoCodigo(status))).toBe(
          status,
        );
      }
    });
  });
});
