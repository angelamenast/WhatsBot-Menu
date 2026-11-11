import { SupabaseNegocioRepository } from '../../src/modules/business/infrastructure/persistence/supabase-negocio.repository';
import { SupabaseCategoryRepository } from '../../src/modules/business/infrastructure/persistence/supabase-category.repository';
import { SupabaseProductRepository } from '../../src/modules/business/infrastructure/persistence/supabase-product.repository';
import type { NewProductData } from '../../src/modules/business/domain/repositories/product.repository';
import { TestContext } from './support/test-context';

describe('Persistencia: negocio y catálogo (Supabase real)', () => {
  const ctx = new TestContext();
  const negocios = new SupabaseNegocioRepository(ctx.service);
  const categorias = new SupabaseCategoryRepository(ctx.service);
  const productos = new SupabaseProductRepository(ctx.service);

  const producto = (categoryId: string, name: string, price: number, available = true): NewProductData => ({
    categoryId,
    name: ctx.name(name),
    description: null,
    price,
    available,
    imageUrl: null,
  });

  afterAll(() => ctx.cleanup());

  it('IT-DB-01 crea un negocio y lo encuentra por usuario', async () => {
    const user = await ctx.createUser();

    const creado = await negocios.crear({
      usuarioId: user.id,
      nombreNegocio: ctx.name('negocio_01'),
      numeroWhatsapp: null,
      descripcion: 'Negocio IT-DB-01',
    });
    ctx.trackNegocio(creado.id);

    const encontrado = await negocios.buscarPorUsuario(user.id);

    expect(encontrado).not.toBeNull();
    expect(encontrado!.id).toBe(creado.id);
    expect(encontrado!.nombreNegocio).toBe(ctx.name('negocio_01'));
    expect(encontrado!.estado).toBe('activo');
    expect(await negocios.existeNegocioActivoPorUsuario(user.id)).toBe(true);
  });

  it('IT-DB-02 crea categorías y productos y los lista por negocio', async () => {
    const { negocio } = await ctx.createUserWithNegocio('negocio_02');

    const creadas = await categorias.createMany(negocio.id, [ctx.name('postres'), ctx.name('bebidas')]);
    expect(creadas).toHaveLength(2);
    const bebidas = creadas.find((c) => c.name === ctx.name('bebidas'))!;

    await productos.createMany(negocio.id, [
      producto(bebidas.id, 'limonada', 6500),
      producto(bebidas.id, 'cafe', 4200.5, false),
    ]);

    const listadas = await categorias.listByBusiness(negocio.id);
    expect(listadas.map((c) => c.name)).toEqual([ctx.name('bebidas'), ctx.name('postres')]);

    const todos = await productos.listByBusiness(negocio.id);
    expect(todos.map((p) => p.name)).toEqual([ctx.name('cafe'), ctx.name('limonada')]);
    const cafe = todos.find((p) => p.name === ctx.name('cafe'))!;
    expect(cafe.price).toBe(4200.5);
    expect(cafe.available).toBe(false);
    expect(cafe.categoryId).toBe(bebidas.id);
    expect(cafe.businessId).toBe(negocio.id);

    const disponibles = await productos.listByBusiness(negocio.id, { onlyAvailable: true });
    expect(disponibles.map((p) => p.name)).toEqual([ctx.name('limonada')]);
  });

  it('IT-DB-03 aislamiento: el negocio A no ve los productos del negocio B', async () => {
    const { negocio: a } = await ctx.createUserWithNegocio('negocio_03a');
    const { negocio: b } = await ctx.createUserWithNegocio('negocio_03b');
    const [catA] = await categorias.createMany(a.id, [ctx.name('cat_a')]);
    const [catB] = await categorias.createMany(b.id, [ctx.name('cat_b')]);

    await productos.createMany(a.id, [producto(catA.id, 'producto_a', 1000)]);
    await productos.createMany(b.id, [producto(catB.id, 'producto_b', 2000)]);

    const deA = await productos.listByBusiness(a.id);
    const deB = await productos.listByBusiness(b.id);
    expect(deA.map((p) => p.name)).toEqual([ctx.name('producto_a')]);
    expect(deB.map((p) => p.name)).toEqual([ctx.name('producto_b')]);

    // Ni pidiendo el id exacto: findByIds filtra por negocio.
    expect(await productos.findByIds(a.id, [deB[0].id])).toEqual([]);
    expect(await categorias.listByBusiness(a.id)).toHaveLength(1);
  });

  it('IT-DB-04 la BD rechaza un precio negativo (CHECK catalogo_productos_precio_check)', async () => {
    const { negocio } = await ctx.createUserWithNegocio('negocio_04');
    const [cat] = await categorias.createMany(negocio.id, [ctx.name('cat_04')]);

    await expect(
      productos.createMany(negocio.id, [producto(cat.id, 'precio_negativo', -1)]),
    ).rejects.toThrow(/catalogo_productos_precio_check/);

    expect(await productos.listByBusiness(negocio.id)).toEqual([]);
  });
});
