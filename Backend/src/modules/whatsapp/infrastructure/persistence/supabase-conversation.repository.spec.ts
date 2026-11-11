import { jest } from '@jest/globals';
import { SupabaseConversationRepository } from './supabase-conversation.repository';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { Conversation } from '../../domain/entities/conversation.entity';
import { ActiveConversationAlreadyExistsError } from '../../domain/errors/whatsapp.errors';

type AnyFn = (...args: any[]) => any;

describe('SupabaseConversationRepository.save', () => {
  let upsert: jest.Mock<AnyFn>;
  let repository: SupabaseConversationRepository;

  const conversation = () =>
    Conversation.start({ businessId: 'business-1', customerNumber: '+573001112233' });

  beforeEach(() => {
    upsert = jest.fn<AnyFn>();
    repository = new SupabaseConversationRepository({
      getClient: () => ({ from: () => ({ upsert }) }),
    } as unknown as SupabaseService);
  });

  it('upsert exitoso: no lanza', async () => {
    upsert.mockResolvedValue({ error: null });

    await expect(repository.save(conversation())).resolves.toBeUndefined();
  });

  it('23505 con el índice uq_conversaciones_activa en el mensaje: lanza el error tipado, sin filtrar el teléfono', async () => {
    upsert.mockResolvedValue({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uq_conversaciones_activa"',
        details: 'Key (negocio_id, numero_cliente)=(business-1, +573001112233) already exists.',
      },
    });

    const error = await repository.save(conversation()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ActiveConversationAlreadyExistsError);
    expect((error as Error).message).not.toContain('+573001112233');
  });

  it('23505 con el índice solo en details: también se reconoce', async () => {
    upsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key', details: 'constraint "uq_conversaciones_activa"' },
    });

    await expect(repository.save(conversation())).rejects.toThrow(ActiveConversationAlreadyExistsError);
  });

  it('23505 de OTRO índice (p. ej. la llave primaria): se propaga tal cual', async () => {
    const otherViolation = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "conversaciones_pkey"',
      details: 'Key (id)=(x) already exists.',
    };
    upsert.mockResolvedValue({ error: otherViolation });

    await expect(repository.save(conversation())).rejects.toBe(otherViolation);
  });

  it('el nombre del índice sin el código 23505 no basta: se propaga', async () => {
    const error = { code: '42P01', message: 'mención de uq_conversaciones_activa en otro error' };
    upsert.mockResolvedValue({ error });

    await expect(repository.save(conversation())).rejects.toBe(error);
  });
});
