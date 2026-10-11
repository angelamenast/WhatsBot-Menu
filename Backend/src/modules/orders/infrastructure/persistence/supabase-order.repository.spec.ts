import { SupabaseOrderRepository } from './supabase-order.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import {
  ConversationNotInBusinessError,
  EmptyOrderError,
  OrderCustomerPhoneMissingError,
} from '../../domain/errors/order.errors';

type Result = { data?: unknown; error?: { message: string } | null };

/**
 * Query builder falso de supabase-js: cada método encadenable se registra en
 * `calls` y devuelve el mismo objeto; al hacer await resuelve con `result`.
 */
function queryBuilder(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: unknown = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === 'then') {
          return (resolve: (value: Result) => unknown) =>
            resolve({ data: null, error: null, ...result });
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return builder;
        };
      },
    },
  );
  return { builder, calls };
}

describe('SupabaseOrderRepository', () => {
  let from: jest.Mock;
  let rpc: jest.Mock;
  let repository: SupabaseOrderRepository;

  const anOrder = () =>
    Order.createPending({
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

  beforeEach(() => {
    from = jest.fn();
    rpc = jest.fn();
    const supabaseService = {
      getClient: () => ({ from, rpc }),
    } as unknown as SupabaseService;

    repository = new SupabaseOrderRepository(supabaseService);
  });

  describe('insert', () => {
    it('crea el pedido con una sola llamada RPC a crear_pedido y sin tocar las tablas directamente', async () => {
      rpc.mockResolvedValue({ data: 'id', error: null });
      const order = anOrder();

      await repository.insert(order);

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('crear_pedido', {
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
      expect(from).not.toHaveBeenCalled();
    });

    it('conversación de otro negocio: traduce el error de la RPC a ConversationNotInBusinessError', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: {
          message:
            'CONVERSATION_NOT_IN_BUSINESS: la conversación x no pertenece al negocio y',
        },
      });

      await expect(repository.insert(anOrder())).rejects.toThrow(
        ConversationNotInBusinessError,
      );
    });

    it('RPC sin items: traduce el error a EmptyOrderError', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { message: 'ORDER_WITHOUT_ITEMS: un pedido necesita items' },
      });

      await expect(repository.insert(anOrder())).rejects.toThrow(
        EmptyOrderError,
      );
    });

    it('cualquier otro error de la RPC se propaga tal cual', async () => {
      const dbError = { message: 'connection refused' };
      rpc.mockResolvedValue({ data: null, error: dbError });

      await expect(repository.insert(anOrder())).rejects.toBe(dbError);
    });
  });

  describe('updateStatus', () => {
    const run = (result: Result) => {
      const { builder, calls } = queryBuilder(result);
      from.mockReturnValue(builder);
      const updatedAt = new Date('2026-01-02T10:00:00.000Z');
      const promise = repository.updateStatus(
        'order-1',
        'business-1',
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        updatedAt,
      );
      return { calls, promise };
    };

    it('actualiza solo si coinciden id, negocio y estado esperado, y devuelve true con 1 fila afectada', async () => {
      const { calls, promise } = run({ data: [{ id: 'order-1' }] });

      await expect(promise).resolves.toBe(true);

      expect(from).toHaveBeenCalledWith('pedidos');
      expect(calls).toContainEqual([
        'update',
        [
          {
            estado_codigo: 'confirmado',
            updated_at: '2026-01-02T10:00:00.000Z',
          },
        ],
      ]);
      expect(calls).toContainEqual(['eq', ['id', 'order-1']]);
      expect(calls).toContainEqual(['eq', ['negocio_id', 'business-1']]);
      expect(calls).toContainEqual(['eq', ['estado_codigo', 'pendiente']]);
      expect(calls).toContainEqual(['select', ['id']]);
    });

    it('0 filas afectadas (alguien cambió el estado antes): devuelve false', async () => {
      const { promise } = run({ data: [] });

      await expect(promise).resolves.toBe(false);
    });

    it('error de Supabase: se propaga', async () => {
      const dbError = { message: 'boom' };
      const { promise } = run({ error: dbError });

      await expect(promise).rejects.toBe(dbError);
    });
  });

  describe('vistas con teléfono del cliente', () => {
    const viewRow = (id: string) => ({
      id,
      negocio_id: 'business-1',
      conversacion_id: 'conversation-1',
      estado_codigo: 'pendiente',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
      pedido_items: [],
      conversaciones: { numero_cliente: '+573001112233' },
    });

    const filter = { limit: 20, offset: 0 };

    const listWith = (
      result: Result & { count?: number | null },
      listFilter: {
        from?: Date;
        to?: Date;
        limit: number;
        offset: number;
      } = filter,
    ) => {
      const { builder, calls } = queryBuilder(result);
      from.mockReturnValue(builder);
      return {
        calls,
        promise: repository.findViewsByBusiness('business-1', listFilter),
      };
    };

    describe('findViewById', () => {
      it('una sola query a pedidos con embed de conversaciones, filtrando por id y negocio', async () => {
        const { builder, calls } = queryBuilder({ data: viewRow('order-1') });
        from.mockReturnValue(builder);

        const view = await repository.findViewById('order-1', 'business-1');

        expect(from).toHaveBeenCalledTimes(1);
        expect(from).toHaveBeenCalledWith('pedidos');
        expect(calls).toContainEqual([
          'select',
          ['*, pedido_items(*), conversaciones!inner(numero_cliente)'],
        ]);
        expect(calls).toContainEqual(['eq', ['id', 'order-1']]);
        expect(calls).toContainEqual(['eq', ['negocio_id', 'business-1']]);
        expect(view?.customerPhone).toBe('+573001112233');
        expect(view?.order.id).toBe('order-1');
      });

      it('pedido de otro negocio o inexistente: null', async () => {
        const { builder } = queryBuilder({ data: null });
        from.mockReturnValue(builder);

        await expect(
          repository.findViewById('order-1', 'business-2'),
        ).resolves.toBeNull();
      });

      it('fila sin teléfono: lanza OrderCustomerPhoneMissingError', async () => {
        const { builder } = queryBuilder({
          data: { ...viewRow('order-1'), conversaciones: null },
        });
        from.mockReturnValue(builder);

        await expect(
          repository.findViewById('order-1', 'business-1'),
        ).rejects.toThrow(OrderCustomerPhoneMissingError);
      });

      it('error de Supabase: se propaga', async () => {
        const dbError = { message: 'boom' };
        const { builder } = queryBuilder({ error: dbError });
        from.mockReturnValue(builder);

        await expect(
          repository.findViewById('order-1', 'business-1'),
        ).rejects.toBe(dbError);
      });
    });

    describe('findViewsByBusiness', () => {
      it('sin fechas: filtra por negocio, cuenta exacto, ordena created_at DESC / id DESC y pagina con range', async () => {
        const { calls, promise } = listWith(
          { data: [viewRow('order-2'), viewRow('order-1')], count: 57 },
          { limit: 20, offset: 40 },
        );

        const page = await promise;

        expect(from).toHaveBeenCalledTimes(1);
        expect(calls).toContainEqual([
          'select',
          [
            '*, pedido_items(*), conversaciones!inner(numero_cliente)',
            { count: 'exact' },
          ],
        ]);
        expect(calls).toContainEqual(['eq', ['negocio_id', 'business-1']]);
        expect(calls.filter(([method]) => method === 'gte')).toHaveLength(0);
        expect(calls.filter(([method]) => method === 'lt')).toHaveLength(0);
        expect(calls.filter(([method]) => method === 'order')).toEqual([
          ['order', ['created_at', { ascending: false }]],
          ['order', ['id', { ascending: false }]],
        ]);
        expect(calls).toContainEqual(['range', [40, 59]]);
        expect(page.total).toBe(57);
        expect(page.items.map((v) => v.order.id)).toEqual([
          'order-2',
          'order-1',
        ]);
        expect(page.items[0].customerPhone).toBe('+573001112233');
      });

      it('solo from: aplica gte (inclusivo) y no lt', async () => {
        const { calls, promise } = listWith(
          { data: [], count: 0 },
          { ...filter, from: new Date('2026-10-10T05:00:00.000Z') },
        );

        await promise;

        expect(calls).toContainEqual([
          'gte',
          ['created_at', '2026-10-10T05:00:00.000Z'],
        ]);
        expect(calls.filter(([method]) => method === 'lt')).toHaveLength(0);
      });

      it('solo to: aplica lt (exclusivo) y no gte', async () => {
        const { calls, promise } = listWith(
          { data: [], count: 0 },
          { ...filter, to: new Date('2026-10-11T05:00:00.000Z') },
        );

        await promise;

        expect(calls).toContainEqual([
          'lt',
          ['created_at', '2026-10-11T05:00:00.000Z'],
        ]);
        expect(calls.filter(([method]) => method === 'gte')).toHaveLength(0);
      });

      it('from y to: aplica ambos', async () => {
        const { calls, promise } = listWith(
          { data: [], count: 0 },
          {
            ...filter,
            from: new Date('2026-10-10T05:00:00.000Z'),
            to: new Date('2026-10-11T05:00:00.000Z'),
          },
        );

        await promise;

        expect(calls).toContainEqual([
          'gte',
          ['created_at', '2026-10-10T05:00:00.000Z'],
        ]);
        expect(calls).toContainEqual([
          'lt',
          ['created_at', '2026-10-11T05:00:00.000Z'],
        ]);
      });

      it('sin resultados: items vacío y total 0', async () => {
        const { promise } = listWith({ data: null, count: 0 });

        await expect(promise).resolves.toEqual({ items: [], total: 0 });
      });

      it('error de Supabase: se propaga', async () => {
        const dbError = { message: 'boom' };
        const { promise } = listWith({ error: dbError });

        await expect(promise).rejects.toBe(dbError);
      });
    });
  });

  describe('findById', () => {
    it('filtra por id Y por negocio en la propia query', async () => {
      const { builder, calls } = queryBuilder({ data: null });
      from.mockReturnValue(builder);

      const result = await repository.findById('order-1', 'business-2');

      expect(result).toBeNull();
      expect(calls).toContainEqual(['eq', ['id', 'order-1']]);
      expect(calls).toContainEqual(['eq', ['negocio_id', 'business-2']]);
    });

    it('si hay fila, la hidrata a un Order', async () => {
      const { builder } = queryBuilder({
        data: {
          id: 'order-1',
          negocio_id: 'business-1',
          conversacion_id: 'conversation-1',
          estado_codigo: 'pendiente',
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
          pedido_items: [],
        },
      });
      from.mockReturnValue(builder);

      const result = await repository.findById('order-1', 'business-1');

      expect(result?.id).toBe('order-1');
      expect(result?.status).toBe(OrderStatus.PENDING);
    });
  });
});
