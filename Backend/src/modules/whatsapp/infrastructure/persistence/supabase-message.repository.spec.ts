import { jest } from '@jest/globals';
import { SupabaseMessageRepository } from './supabase-message.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

type AnyFn = (...args: any[]) => any;

describe('SupabaseMessageRepository.findLastMessageDate', () => {
  let chain: Record<string, jest.Mock<AnyFn>>;
  let from: jest.Mock<AnyFn>;
  let repository: SupabaseMessageRepository;

  beforeEach(() => {
    chain = {};
    for (const method of ['select', 'eq', 'order', 'limit']) {
      chain[method] = jest.fn<AnyFn>().mockReturnValue(chain);
    }
    chain.maybeSingle = jest.fn<AnyFn>();
    from = jest.fn<AnyFn>().mockReturnValue(chain);
    repository = new SupabaseMessageRepository({
      getClient: () => ({ from }),
    } as unknown as SupabaseService);
  });

  it('una sola lectura: created_at del mensaje más reciente de la conversación', async () => {
    chain.maybeSingle.mockResolvedValue({ data: { created_at: '2026-10-22T10:00:00.000Z' }, error: null });

    const date = await repository.findLastMessageDate('conversation-1');

    expect(date).toEqual(new Date('2026-10-22T10:00:00.000Z'));
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('mensajes');
    expect(chain.select).toHaveBeenCalledWith('created_at');
    expect(chain.eq).toHaveBeenCalledWith('conversacion_id', 'conversation-1');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('sin mensajes devuelve null', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(repository.findLastMessageDate('conversation-1')).resolves.toBeNull();
  });

  it('propaga el error de Supabase', async () => {
    const dbError = new Error('db caída');
    chain.maybeSingle.mockResolvedValue({ data: null, error: dbError });

    await expect(repository.findLastMessageDate('conversation-1')).rejects.toBe(dbError);
  });
});
