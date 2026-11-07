import { jest } from '@jest/globals';
import { SupabaseConversationHistoryRepository } from './supabase-conversation-history.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

type AnyFn = (...args: any[]) => any;

describe('SupabaseConversationHistoryRepository.findRecentByConversationId', () => {
  let chain: Record<string, jest.Mock<AnyFn>>;
  let from: jest.Mock<AnyFn>;
  let repository: SupabaseConversationHistoryRepository;

  const rows = [
    // La BD devuelve del más reciente al más antiguo (created_at DESC, id DESC).
    { remitente: 'agente_ia', contenido: 'tercero', created_at: '2026-10-18T10:00:02.000Z' },
    { remitente: 'cliente', contenido: 'segundo', created_at: '2026-10-18T10:00:01.000Z' },
    { remitente: 'cliente', contenido: 'primero', created_at: '2026-10-18T10:00:01.000Z' },
  ];

  beforeEach(() => {
    chain = {};
    for (const method of ['select', 'eq', 'neq', 'in', 'or', 'order', 'limit']) {
      chain[method] = jest.fn<AnyFn>().mockReturnValue(chain);
    }
    chain.returns = jest.fn<AnyFn>().mockResolvedValue({ data: rows, error: null });
    from = jest.fn<AnyFn>().mockReturnValue(chain);
    repository = new SupabaseConversationHistoryRepository({
      getClient: () => ({ from }),
    } as unknown as SupabaseService);
  });

  it('excluye el mensaje entrante por id, ya no por posición', async () => {
    await repository.findRecentByConversationId('conversation-1', 10, 'message-42');

    expect(from).toHaveBeenCalledWith('mensajes');
    expect(chain.eq).toHaveBeenCalledWith('conversacion_id', 'conversation-1');
    expect(chain.neq).toHaveBeenCalledWith('id', 'message-42');
  });

  it('pide exactamente el límite (sin el +1 del slice anterior)', async () => {
    await repository.findRecentByConversationId('conversation-1', 10, 'message-42');

    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('solo cliente y agente_ia, y excluye envíos fallidos admitiendo estado_envio nulo (mensajes del cliente)', async () => {
    await repository.findRecentByConversationId('conversation-1', 10, 'message-42');

    expect(chain.in).toHaveBeenCalledWith('remitente', ['cliente', 'agente_ia']);
    expect(chain.or).toHaveBeenCalledWith('estado_envio.is.null,estado_envio.neq.fallido');
  });

  it('orden estable en BD: created_at DESC y, en empate, id DESC', async () => {
    await repository.findRecentByConversationId('conversation-1', 10, 'message-42');

    expect(chain.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('devuelve en orden cronológico (del más antiguo al más reciente) con roles mapeados', async () => {
    const history = await repository.findRecentByConversationId('conversation-1', 10, 'message-42');

    expect(history.map((message) => [message.sender, message.content])).toEqual([
      ['CUSTOMER', 'primero'],
      ['CUSTOMER', 'segundo'],
      ['AGENT', 'tercero'],
    ]);
    expect(history[0].createdAt).toBeInstanceOf(Date);
  });

  it('data null sin error: lista vacía; con error: lo propaga', async () => {
    chain.returns.mockResolvedValue({ data: null, error: null });
    await expect(repository.findRecentByConversationId('c', 10, 'm')).resolves.toEqual([]);

    const dbError = new Error('db caída');
    chain.returns.mockResolvedValue({ data: null, error: dbError });
    await expect(repository.findRecentByConversationId('c', 10, 'm')).rejects.toBe(dbError);
  });
});
