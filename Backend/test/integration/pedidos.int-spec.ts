import { SupabaseOrderRepository } from '../../src/modules/orders/infrastructure/persistence/supabase-order.repository';
import { SupabaseCategoryRepository } from '../../src/modules/business/infrastructure/persistence/supabase-category.repository';
import { SupabaseProductRepository } from '../../src/modules/business/infrastructure/persistence/supabase-product.repository';
import { Order, OrderStatus } from '../../src/modules/orders/domain/entities/order.entity';
import { OrderItem } from '../../src/modules/orders/domain/entities/order-item.entity';
import { ConversationAlreadyHasOrderError } from '../../src/modules/orders/domain/errors/order.errors';
import type { Product } from '../../src/modules/business/domain/entities/product.entity';
import { TestContext } from './support/test-context';

describe('Persistencia: pedidos y RPC crear_pedido (Supabase real)', () => {
  const ctx = new TestContext();
  const pedidos = new SupabaseOrderRepository(ctx.service);

  let negocioId: string;
  let hamburguesa: Product;
  let gaseosa: Product;

  const itemsValidos = () => [
    OrderItem.create({
      productId: hamburguesa.id,
      productNameSnapshot: hamburguesa.name,
      unitPrice: hamburguesa.price,
      quantity: 2,
    }),
    OrderItem.create({
      productId: gaseosa.id,
      productNameSnapshot: gaseosa.name,
      unitPrice: gaseosa.price,
      quantity: 3,
    }),
  ];

  const nuevoPedido = (conversationId: string, items = itemsValidos()) =>
    Order.createPending({ businessId: negocioId, conversationId, items });

  const contarItems = async (pedidoId: string): Promise<number> => {
    const { count, error } = await ctx.client
      .from('pedido_items')
      .select('id', { count: 'exact', head: true })
      .eq('pedido_id', pedidoId);
    if (error) throw error;
    return count ?? 0;
  };

  beforeAll(async () => {
    ({
      negocio: { id: negocioId },
    } = await ctx.createUserWithNegocio('negocio_pedidos'));
    const [cat] = await new SupabaseCategoryRepository(ctx.service).createMany(negocioId, [ctx.name('menu')]);
    const productos = new SupabaseProductRepository(ctx.service);
    await productos.createMany(negocioId, [
      { categoryId: cat.id, name: ctx.name('hamburguesa'), description: null, price: 18900.5, available: true, imageUrl: null },
      { categoryId: cat.id, name: ctx.name('gaseosa'), description: null, price: 3500, available: true, imageUrl: null },
    ]);
    const lista = await productos.listByBusiness(negocioId);
    hamburguesa = lista.find((p) => p.name === ctx.name('hamburguesa'))!;
    gaseosa = lista.find((p) => p.name === ctx.name('gaseosa'))!;
  });

  afterAll(() => ctx.cleanup());

  it('IT-DB-09 crear_pedido guarda el pedido y sus ítems en una sola operación', async () => {
    const conversacion = await ctx.createConversation(negocioId);
    const pedido = nuevoPedido(conversacion.id);

    await pedidos.insert(pedido);

    const guardado = await pedidos.findById(pedido.id, negocioId);
    expect(guardado).not.toBeNull();
    expect(guardado!.status).toBe(OrderStatus.PENDING);
    expect(guardado!.conversationId).toBe(conversacion.id);
    expect(guardado!.items).toHaveLength(2);
    expect(guardado!.total).toBe(2 * 18900.5 + 3 * 3500);

    // total y subtotal los calcula la BD.
    const { data: fila } = await ctx.client.from('pedidos').select('total').eq('id', pedido.id).single();
    expect(Number(fila!.total)).toBe(48301);
    const { data: items } = await ctx.client
      .from('pedido_items')
      .select('producto_id, cantidad, subtotal')
      .eq('pedido_id', pedido.id);
    expect(items!.find((i) => i.producto_id === hamburguesa.id)).toMatchObject({ cantidad: 2 });
    expect(Number(items!.find((i) => i.producto_id === hamburguesa.id)!.subtotal)).toBe(37801);

    const vista = await pedidos.findViewById(pedido.id, negocioId);
    expect(vista!.customerPhone).toBe(conversacion.customerNumber);
  });

  it('IT-DB-10 atomicidad: si un ítem es inválido no queda ni el pedido ni ítems sueltos', async () => {
    const conversacion = await ctx.createConversation(negocioId);
    // reconstitute salta la validación de dominio para que el ítem llegue a la BD
    // (cantidad 0 viola pedido_items_cantidad_check) DESPUÉS de insertar el pedido.
    const items = [
      ...itemsValidos(),
      OrderItem.reconstitute({
        productId: gaseosa.id,
        productNameSnapshot: gaseosa.name,
        unitPrice: gaseosa.price,
        quantity: 0,
      }),
    ];
    const pedido = nuevoPedido(conversacion.id, items);

    await expect(pedidos.insert(pedido)).rejects.toMatchObject({
      message: expect.stringMatching(/pedido_items_cantidad_check/),
    });

    expect(await pedidos.findById(pedido.id, negocioId)).toBeNull();
    expect(await contarItems(pedido.id)).toBe(0);
    // La conversación sigue libre: se puede crear un pedido válido.
    await expect(pedidos.insert(nuevoPedido(conversacion.id))).resolves.toBeUndefined();
  });

  it('IT-DB-11 uq_pedidos_conversacion_abierto: un solo pedido abierto por conversación; tras cancelar se permite otro', async () => {
    const conversacion = await ctx.createConversation(negocioId);
    const primero = nuevoPedido(conversacion.id);
    await pedidos.insert(primero);

    const segundo = nuevoPedido(conversacion.id);
    const error = await pedidos.insert(segundo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConversationAlreadyHasOrderError);
    expect((error as ConversationAlreadyHasOrderError).orderId).toBe(primero.id);
    expect(await pedidos.findById(segundo.id, negocioId)).toBeNull();
    expect(await contarItems(segundo.id)).toBe(0);

    const cancelado = await pedidos.updateStatus(
      primero.id,
      negocioId,
      OrderStatus.PENDING,
      OrderStatus.CANCELLED,
      new Date(),
    );
    expect(cancelado).toBe(true);

    const tercero = nuevoPedido(conversacion.id);
    await pedidos.insert(tercero);

    const abierto = await pedidos.findOpenByConversation(conversacion.id, negocioId);
    expect(abierto!.id).toBe(tercero.id);
    expect((await pedidos.findById(primero.id, negocioId))!.status).toBe(OrderStatus.CANCELLED);
  });
});
