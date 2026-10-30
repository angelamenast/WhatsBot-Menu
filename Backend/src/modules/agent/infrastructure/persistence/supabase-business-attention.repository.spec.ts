import { jest } from '@jest/globals';
import { SupabaseBusinessAttentionRepository } from './supabase-business-attention.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { BusinessNotFoundError } from '../../domain/errors/agent.errors';

type AnyFn = (...args: any[]) => any;

describe('SupabaseBusinessAttentionRepository', () => {
  let maybeSingle: jest.Mock<AnyFn>;
  let eq: jest.Mock<AnyFn>;
  let select: jest.Mock<AnyFn>;
  let from: jest.Mock<AnyFn>;
  let repository: SupabaseBusinessAttentionRepository;

  beforeEach(() => {
    maybeSingle = jest.fn<AnyFn>();
    eq = jest.fn<AnyFn>().mockReturnValue({ maybeSingle });
    select = jest.fn<AnyFn>().mockReturnValue({ eq });
    from = jest.fn<AnyFn>().mockReturnValue({ select });
    repository = new SupabaseBusinessAttentionRepository({
      getClient: () => ({ from }),
    } as unknown as SupabaseService);
  });

  it('hace UNA query a negocios filtrando por id y mapea los flags', async () => {
    maybeSingle.mockResolvedValue({
      data: { nombre_negocio: 'Mi Restaurante', atencion_automatica_activa: true, estado: 'activo', deleted_at: null },
      error: null,
    });

    await expect(repository.getStatus('business-1')).resolves.toEqual({
      businessName: 'Mi Restaurante',
      autoAttentionActive: true,
      businessActive: true,
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('negocios');
    expect(select).toHaveBeenCalledWith('nombre_negocio, atencion_automatica_activa, estado, deleted_at');
    expect(eq).toHaveBeenCalledWith('id', 'business-1');
  });

  it.each([
    ['inactivo', null],
    ['suspendido', null],
    ['activo', '2026-10-01T00:00:00Z'],
  ])('estado "%s" con deleted_at %s: el negocio no está activo', async (estado, deletedAt) => {
    maybeSingle.mockResolvedValue({
      data: { nombre_negocio: 'Mi Restaurante', atencion_automatica_activa: true, estado, deleted_at: deletedAt },
      error: null,
    });

    await expect(repository.getStatus('business-1')).resolves.toMatchObject({ businessActive: false });
  });

  it('fila inexistente: lanza BusinessNotFoundError', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(repository.getStatus('business-1')).rejects.toThrow(BusinessNotFoundError);
  });

  it('error de Supabase: se propaga', async () => {
    const dbError = new Error('db caída');
    maybeSingle.mockResolvedValue({ data: null, error: dbError });

    await expect(repository.getStatus('business-1')).rejects.toBe(dbError);
  });
});
