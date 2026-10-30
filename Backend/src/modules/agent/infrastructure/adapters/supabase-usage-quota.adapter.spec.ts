import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { SupabaseUsageQuotaAdapter } from './supabase-usage-quota.adapter';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

type AnyFn = (...args: any[]) => any;

describe('SupabaseUsageQuotaAdapter', () => {
  let returns: jest.Mock<AnyFn>;
  let rpc: jest.Mock<AnyFn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let adapter: SupabaseUsageQuotaAdapter;

  const resolveWith = (data: unknown, error: unknown = null) => {
    returns.mockResolvedValue({ data, error });
  };

  beforeEach(() => {
    returns = jest.fn<AnyFn>();
    rpc = jest.fn<AnyFn>().mockReturnValue({ returns });
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    adapter = new SupabaseUsageQuotaAdapter({
      getClient: () => ({ rpc }),
    } as unknown as SupabaseService);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('consulta la función consultar_cuota_tokens con el id del negocio', async () => {
    resolveWith([{ hay_suscripcion: true, limite_tokens: null, tokens_usados: 0 }]);

    await adapter.hasQuota('business-1');

    expect(rpc).toHaveBeenCalledWith('consultar_cuota_tokens', { p_negocio_id: 'business-1' });
  });

  it('límite null (plan ilimitado): hay cuota por mucho que se haya usado', async () => {
    resolveWith([{ hay_suscripcion: true, limite_tokens: null, tokens_usados: 9_999_999 }]);

    await expect(adapter.hasQuota('business-1')).resolves.toBe(true);
  });

  it('tokens usados por debajo del tope: hay cuota', async () => {
    resolveWith([{ hay_suscripcion: true, limite_tokens: 1000, tokens_usados: 999 }]);

    await expect(adapter.hasQuota('business-1')).resolves.toBe(true);
  });

  it('tokens usados igual al tope: no hay cuota', async () => {
    resolveWith([{ hay_suscripcion: true, limite_tokens: 1000, tokens_usados: 1000 }]);

    await expect(adapter.hasQuota('business-1')).resolves.toBe(false);
  });

  it('tokens usados sobre el tope (un mensaje pudo sobrepasarlo): no hay cuota', async () => {
    resolveWith([{ hay_suscripcion: true, limite_tokens: 1000, tokens_usados: 1350 }]);

    await expect(adapter.hasQuota('business-1')).resolves.toBe(false);
  });

  it('bigint llegado como texto se compara numéricamente', async () => {
    resolveWith([{ hay_suscripcion: true, limite_tokens: '1000', tokens_usados: '999' }]);

    await expect(adapter.hasQuota('business-1')).resolves.toBe(true);
  });

  it('sin suscripción vigente: no hay cuota', async () => {
    resolveWith([{ hay_suscripcion: false, limite_tokens: null, tokens_usados: 0 }]);
    await expect(adapter.hasQuota('business-1')).resolves.toBe(false);

    resolveWith([]);
    await expect(adapter.hasQuota('business-1')).resolves.toBe(false);

    resolveWith(null);
    await expect(adapter.hasQuota('business-1')).resolves.toBe(false);
  });

  it('error de la consulta: prioriza la disponibilidad (true) y loguea solo con el id del negocio', async () => {
    resolveWith(null, new Error('timeout'));

    await expect(adapter.hasQuota('business-1')).resolves.toBe(true);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('business-1');
  });

  it('si el cliente lanza en lugar de devolver error: también devuelve true', async () => {
    rpc.mockImplementation(() => {
      throw new Error('red caída');
    });

    await expect(adapter.hasQuota('business-1')).resolves.toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
