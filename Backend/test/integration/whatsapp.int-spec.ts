import { SupabaseConversationRepository } from '../../src/modules/whatsapp/infrastructure/persistence/supabase-conversation.repository';
import { SupabaseMessageRepository } from '../../src/modules/whatsapp/infrastructure/persistence/supabase-message.repository';
import { SupabaseProcessedMessageRepository } from '../../src/modules/whatsapp/infrastructure/persistence/supabase-processed-message.repository';
import { Conversation, ConversationStatus } from '../../src/modules/whatsapp/domain/entities/conversation.entity';
import { Message } from '../../src/modules/whatsapp/domain/entities/message.entity';
import { ActiveConversationAlreadyExistsError } from '../../src/modules/whatsapp/domain/errors/whatsapp.errors';
import { TestContext } from './support/test-context';

describe('Persistencia: conversaciones y mensajes de WhatsApp (Supabase real)', () => {
  const ctx = new TestContext();
  const conversaciones = new SupabaseConversationRepository(ctx.service);
  const mensajes = new SupabaseMessageRepository(ctx.service);
  const procesados = new SupabaseProcessedMessageRepository(ctx.service);

  let negocioId: string;

  beforeAll(async () => {
    ({
      negocio: { id: negocioId },
    } = await ctx.createUserWithNegocio('negocio_whatsapp'));
  });

  afterAll(() => ctx.cleanup());

  it('IT-DB-12 uq_conversaciones_activa: no dos ACTIVAS del mismo cliente y negocio; sí varias cerradas', async () => {
    const cliente = ctx.phone();
    const primera = Conversation.start({ businessId: negocioId, customerNumber: cliente });
    await conversaciones.save(primera);

    const segunda = Conversation.start({ businessId: negocioId, customerNumber: cliente });
    await expect(conversaciones.save(segunda)).rejects.toBeInstanceOf(ActiveConversationAlreadyExistsError);

    // Otro cliente del mismo negocio sí puede tener su conversación activa.
    await expect(
      conversaciones.save(Conversation.start({ businessId: negocioId, customerNumber: ctx.phone() })),
    ).resolves.toBeUndefined();

    primera.close();
    await conversaciones.save(primera);
    await conversaciones.save(segunda); // ahora sí: la anterior está cerrada
    segunda.close();
    await conversaciones.save(segunda);
    const tercera = Conversation.start({ businessId: negocioId, customerNumber: cliente });
    await conversaciones.save(tercera);

    const { data, error } = await ctx.client
      .from('conversaciones')
      .select('id, estado')
      .eq('negocio_id', negocioId)
      .eq('numero_cliente', cliente);
    expect(error).toBeNull();
    expect(data!.filter((c) => c.estado === 'cerrada')).toHaveLength(2);
    expect(data!.filter((c) => c.estado === 'activa').map((c) => c.id)).toEqual([tercera.id]);

    const activa = await conversaciones.findActiveByBusinessAndCustomer(negocioId, cliente);
    expect(activa!.id).toBe(tercera.id);
    expect((await conversaciones.findById(primera.id))!.status).toBe(ConversationStatus.CLOSED);
  });

  it('IT-DB-13 idempotencia: el mismo id de mensaje del proveedor no se guarda dos veces', async () => {
    const conversacion = await ctx.createConversation(negocioId);
    const wamid = ctx.name('wamid_1');

    expect(await procesados.existsByProviderMessageId(wamid)).toBe(false);

    const original = Message.receiveFromCustomer({
      conversationId: conversacion.id,
      content: 'Hola, quiero pedir',
      providerMessageId: wamid,
    });
    await mensajes.save(original);
    expect(await procesados.existsByProviderMessageId(wamid)).toBe(true);

    // Reintento del webhook: mensaje nuevo (otro id) con el mismo wamid.
    const reintento = Message.receiveFromCustomer({
      conversationId: conversacion.id,
      content: 'Hola, quiero pedir',
      providerMessageId: wamid,
    });
    await expect(mensajes.save(reintento)).rejects.toMatchObject({
      code: '23505',
      message: expect.stringMatching(/mensajes_id_mensaje_proveedor_key/),
    });

    const { count } = await ctx.client
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('id_mensaje_proveedor', wamid);
    expect(count).toBe(1);
    expect((await mensajes.findByProviderMessageId(wamid))!.id).toBe(original.id);
  });
});
