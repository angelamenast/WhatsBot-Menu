import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { SupabaseCatalogRepository } from './supabase-catalog.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { MAX_CATALOG_ITEMS } from '../../domain/repositories/catalog.repository';

type AnyFn = (...args: any[]) => any;

interface Row {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponible: boolean;
  categorias_producto: { nombre: string } | null;
}

const aRow = (overrides: Partial<Row> & { id: string }): Row => ({
  nombre: `Producto ${overrides.id}`,
  descripcion: null,
  precio: 1000,
  disponible: true,
  categorias_producto: null,
  ...overrides,
});

describe('SupabaseCatalogRepository', () => {
  let chain: Record<string, jest.Mock<AnyFn>>;
  let from: jest.Mock<AnyFn>;
  let warnSpy: ReturnType<typeof jest.spyOn>;
  let repository: SupabaseCatalogRepository;

  const resolveWith = (rows: Row[] | null, error: unknown = null) => {
    chain.returns.mockResolvedValue({ data: rows, error });
  };

  beforeEach(() => {
    chain = {};
    for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
      chain[method] = jest.fn<AnyFn>().mockReturnValue(chain);
    }
    chain.returns = jest.fn<AnyFn>();
    from = jest.fn<AnyFn>().mockReturnValue(chain);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository = new SupabaseCatalogRepository({
      getClient: () => ({ from }),
    } as unknown as SupabaseService);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('filtra por negocio_id y deleted_at, NO por disponibilidad, y pide MAX + 1 filas', async () => {
    resolveWith([]);

    await repository.findByBusinessId('business-1');

    expect(from).toHaveBeenCalledWith('catalogo_productos');
    expect(chain.eq).toHaveBeenCalledWith('negocio_id', 'business-1');
    expect(chain.eq).not.toHaveBeenCalledWith('disponible', expect.anything());
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    expect(chain.limit).toHaveBeenCalledWith(MAX_CATALOG_ITEMS + 1);
    expect(chain.order).toHaveBeenCalledWith('disponible', { ascending: false });
  });

  it('incluye los agotados con su flag available', async () => {
    resolveWith([
      aRow({ id: 'a', nombre: 'Hamburguesa', disponible: true }),
      aRow({ id: 'b', nombre: 'Limonada', disponible: false }),
    ]);

    const items = await repository.findByBusinessId('business-1');

    expect(items.map((item) => [item.name, item.available])).toEqual([
      ['Hamburguesa', true],
      ['Limonada', false],
    ]);
  });

  it('ordena: disponibles primero y luego por categoría (sin categoría al final) y nombre', async () => {
    resolveWith([
      aRow({ id: '1', nombre: 'Zumo', disponible: false, categorias_producto: { nombre: 'Bebidas' } }),
      aRow({ id: '2', nombre: 'Suelto', disponible: true, categorias_producto: null }),
      aRow({ id: '3', nombre: 'Papas', disponible: true, categorias_producto: { nombre: 'Acompañamientos' } }),
      aRow({ id: '4', nombre: 'Soda', disponible: true, categorias_producto: { nombre: 'Bebidas' } }),
      aRow({ id: '5', nombre: 'Agua', disponible: true, categorias_producto: { nombre: 'Bebidas' } }),
    ]);

    const items = await repository.findByBusinessId('business-1');

    expect(items.map((item) => item.name)).toEqual(['Papas', 'Agua', 'Soda', 'Suelto', 'Zumo']);
  });

  it('con exactamente MAX filas no hay truncado ni warning', async () => {
    resolveWith(Array.from({ length: MAX_CATALOG_ITEMS }, (_, i) => aRow({ id: `p${i}` })));

    const items = await repository.findByBusinessId('business-1');

    expect(items).toHaveLength(MAX_CATALOG_ITEMS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('con MAX + 1 filas: trunca a MAX, detecta el truncado y avisa solo con el id del negocio', async () => {
    const rows = Array.from({ length: MAX_CATALOG_ITEMS }, (_, i) => aRow({ id: `p${i}`, nombre: 'Secreto' }));
    rows.push(aRow({ id: 'agotado', nombre: 'Agotado', disponible: false }));
    resolveWith(rows);

    const items = await repository.findByBusinessId('business-1');

    expect(items).toHaveLength(MAX_CATALOG_ITEMS);
    expect(items.some((item) => item.id === 'agotado')).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('business-1');
    expect(message).not.toContain('Secreto');
  });

  it('mapea los campos a CatalogItem', async () => {
    resolveWith([
      aRow({
        id: 'a',
        nombre: 'Hamburguesa',
        descripcion: 'Con queso',
        precio: 18000,
        categorias_producto: { nombre: 'Comida' },
      }),
    ]);

    await expect(repository.findByBusinessId('business-1')).resolves.toEqual([
      {
        id: 'a',
        name: 'Hamburguesa',
        description: 'Con queso',
        price: 18000,
        available: true,
        categoryName: 'Comida',
      },
    ]);
  });

  it('data null sin error: devuelve lista vacía; con error: lo propaga', async () => {
    resolveWith(null);
    await expect(repository.findByBusinessId('business-1')).resolves.toEqual([]);

    const dbError = new Error('db caída');
    resolveWith(null, dbError);
    await expect(repository.findByBusinessId('business-1')).rejects.toBe(dbError);
  });
});
