import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { HandleStatusCallbackUseCase } from './handle-status-callback.use-case';
import { MessageRepository } from '../../domain/repositories/message.repository';
import { Message, MessageDeliveryStatus, MessageSender } from '../../domain/entities/message.entity';
import { ProviderMessageStatus } from '../dto/handle-status-callback.command';

describe('HandleStatusCallbackUseCase', () => {
  let messageRepository: jest.Mocked<MessageRepository>;
  let warnSpy: ReturnType<typeof jest.spyOn>;
  let useCase: HandleStatusCallbackUseCase;

  const aMessage = (deliveryStatus: MessageDeliveryStatus) =>
    Message.sentByAgent({
      conversationId: 'conversation-1',
      content: 'Tu pedido está listo',
      providerMessageId: 'wamid.123',
      deliveryStatus,
    });

  beforeEach(() => {
    messageRepository = {
      save: jest.fn(),
      findByProviderMessageId: jest.fn(),
      findLastMessageDate: jest.fn(),
    };
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    useCase = new HandleStatusCallbackUseCase(messageRepository);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it.each<[ProviderMessageStatus, MessageDeliveryStatus]>([
    ['sent', 'sent'],
    ['delivered', 'sent'],
    ['read', 'sent'],
    ['failed', 'failed'],
  ])('estado "%s": encuentra el mensaje pendiente, lo mapea a "%s" y lo persiste', async (status, expected) => {
    const message = aMessage('pending');
    messageRepository.findByProviderMessageId.mockResolvedValue(message);

    await useCase.execute({ providerMessageId: 'wamid.123', status });

    expect(messageRepository.findByProviderMessageId).toHaveBeenCalledWith('wamid.123');
    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage).toBe(message);
    expect(savedMessage.deliveryStatus).toBe(expected);
    expect(savedMessage.sender).toBe(MessageSender.AGENT);
  });

  it('un "sent" tardío no pisa un "failed"', async () => {
    const message = aMessage('failed');
    messageRepository.findByProviderMessageId.mockResolvedValue(message);

    await useCase.execute({ providerMessageId: 'wamid.123', status: 'sent' });

    expect(message.deliveryStatus).toBe('failed');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('un "delivered" o "read" tras "failed" tampoco lo pisan', async () => {
    const message = aMessage('failed');
    messageRepository.findByProviderMessageId.mockResolvedValue(message);

    await useCase.execute({ providerMessageId: 'wamid.123', status: 'read' });

    expect(message.deliveryStatus).toBe('failed');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('"failed" sí pisa un "sent" (el envío salió y luego falló la entrega)', async () => {
    const message = aMessage('sent');
    messageRepository.findByProviderMessageId.mockResolvedValue(message);

    await useCase.execute({ providerMessageId: 'wamid.123', status: 'failed' });

    expect(message.deliveryStatus).toBe('failed');
    expect(messageRepository.save).toHaveBeenCalledTimes(1);
  });

  it('estado repetido (ya "sent"): no vuelve a escribir', async () => {
    messageRepository.findByProviderMessageId.mockResolvedValue(aMessage('sent'));

    await useCase.execute({ providerMessageId: 'wamid.123', status: 'delivered' });

    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('"failed" con error: loguea code y message del proveedor', async () => {
    messageRepository.findByProviderMessageId.mockResolvedValue(aMessage('sent'));

    await useCase.execute({
      providerMessageId: 'wamid.123',
      status: 'failed',
      error: { code: 131047, message: 'Re-engagement message' },
    });

    const logged = warnSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
    expect(logged).toContain('131047');
    expect(logged).toContain('Re-engagement message');
  });

  it('mensaje no encontrado: no lanza y no llama a save', async () => {
    messageRepository.findByProviderMessageId.mockResolvedValue(null);

    await expect(
      useCase.execute({ providerMessageId: 'wamid.desconocido', status: 'sent' }),
    ).resolves.toBeUndefined();

    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('estado desconocido/no mapeable: se ignora (loguea y retorna), sin consultar ni persistir', async () => {
    const command = {
      providerMessageId: 'wamid.123',
      status: 'deleted' as unknown as ProviderMessageStatus,
    };

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.findByProviderMessageId).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
