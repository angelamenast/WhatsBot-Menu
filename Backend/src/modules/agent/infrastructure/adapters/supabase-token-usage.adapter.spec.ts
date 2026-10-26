import { jest } from '@jest/globals';
import { SupabaseTokenUsageAdapter } from './supabase-token-usage.adapter';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

type AnyFn = (...args: any[]) => any;

describe('SupabaseTokenUsageAdapter', () => {
  let rpc: jest.Mock<AnyFn>;
  let adapter: SupabaseTokenUsageAdapter;

  beforeEach(() => {
    rpc = jest.fn<AnyFn>().mockResolvedValue({ data: null, error: null });
    adapter = new SupabaseTokenUsageAdapter({
      getClient: () => ({ rpc }),
    } as unknown as SupabaseService);
  });

  it('registra con UNA llamada a registrar_consumo_ia, incluido el id del mensaje', async () => {
    await adapter.record({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      tokensInput: 30,
      tokensOutput: 12,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('registrar_consumo_ia', {
      p_negocio_id: 'business-1',
      p_conversacion_id: 'conversation-1',
      p_mensaje_id: 'message-1',
      p_tokens_entrada: 30,
      p_tokens_salida: 12,
    });
  });

  it('sin id de mensaje envía null', async () => {
    await adapter.record({
      businessId: 'business-1',
      conversationId: 'conversation-1',
      tokensInput: 1,
      tokensOutput: 2,
    });

    expect(rpc).toHaveBeenCalledWith(
      'registrar_consumo_ia',
      expect.objectContaining({ p_mensaje_id: null }),
    );
  });

  it('si la función falla, propaga el error (el caso de uso lo loguea y entrega la respuesta igual)', async () => {
    const dbError = new Error('función no existe');
    rpc.mockResolvedValue({ data: null, error: dbError });

    await expect(
      adapter.record({ businessId: 'b', conversationId: 'c', tokensInput: 1, tokensOutput: 1 }),
    ).rejects.toBe(dbError);
  });
});
