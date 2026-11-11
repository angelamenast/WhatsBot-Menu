import { OrderMapper } from './order.mapper';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import {
  OrderCustomerPhoneMissingError,
  UnknownOrderStatusError,
} from '../../domain/errors/order.errors';

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

  describe('items hidratados', () => {
    it('productId nulo (producto eliminado del catálogo): se hidrata y conserva el snapshot', () => {
      const order = OrderMapper.toDomain(
        aRow('pendiente', [
          {
            producto_id: null,
            nombre_producto_snapshot: 'Producto retirado',
            precio_unitario: 8000,
            cantidad: 2,
          },
        ]),
      );

      expect(order.items[0].productId).toBeNull();
      expect(order.items[0].productNameSnapshot).toBe('Producto retirado');
      expect(order.total).toBe(16000);
    });

    it('cantidad por encima del tope (dato persistido): no rompe la lectura', () => {
      const order = OrderMapper.toDomain(
        aRow('pendiente', [
          {
            producto_id: 'product-1',
            nombre_producto_snapshot: 'Hamburguesa clásica',
            precio_unitario: 1000,
            cantidad: 150,
          },
        ]),
      );

      expect(order.items[0].quantity).toBe(150);
    });
  });

  describe('toView', () => {
    const rowWith = (conversaciones: unknown) =>
      ({
        ...(aRow('pendiente') as object),
        conversaciones,
      }) as never;

    it('embed many-to-one como objeto: extrae el teléfono', () => {
      const view = OrderMapper.toView(
        rowWith({ numero_cliente: '+573001112233' }),
      );

      expect(view.customerPhone).toBe('+573001112233');
      expect(view.order.id).toBe('order-1');
    });

    it('embed como array de un elemento (por defensa): extrae el teléfono', () => {
      const view = OrderMapper.toView(
        rowWith([{ numero_cliente: '+573001112233' }]),
      );

      expect(view.customerPhone).toBe('+573001112233');
    });

    it.each([
      ['sin embed', undefined],
      ['embed null', null],
      ['array vacío', []],
      ['número null', { numero_cliente: null }],
      ['número vacío', { numero_cliente: '' }],
    ])(
      '%s: lanza OrderCustomerPhoneMissingError (nunca devuelve string vacío)',
      (_label, embed) => {
        expect(() => OrderMapper.toView(rowWith(embed))).toThrow(
          OrderCustomerPhoneMissingError,
        );
      },
    );

    it('el mensaje del error identifica el pedido y no contiene datos del cliente', () => {
      expect.assertions(2);
      try {
        OrderMapper.toView(rowWith({ numero_cliente: '' }));
      } catch (error) {
        expect((error as Error).message).toContain('order-1');
        expect((error as Error).message).not.toMatch(/\+57/);
      }
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
