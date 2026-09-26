import { HandleStatusCallbackUseCase } from './handle-status-callback.use-case';
import { MessageRepository } from '../../domain/repositories/message.repository';
import { Message, MessageSender } from '../../domain/entities/message.entity';
import { HandleStatusCallbackCommand, TwilioMessageStatus } from '../dto/handle-status-callback.command';

describe('HandleStatusCallbackUseCase', () => {
  let messageRepository: jest.Mocked<MessageRepository>;
  let useCase: HandleStatusCallbackUseCase;

  const aMessage = () =>
    Message.sentByAgent({
      conversationId: 'conversation-1',
      content: 'Tu pedido está listo',
      providerMessageId: 'SM123',
      deliveryStatus: 'pending',
    });

  beforeEach(() => {
    messageRepository = {
      save: jest.fn(),
      findByProviderMessageId: jest.fn(),
    };

    useCase = new HandleStatusCallbackUseCase(messageRepository);
  });

  it('actualización exitosa: encuentra el mensaje, mapea el status de Twilio y lo persiste', async () => {
    const message = aMessage();
    messageRepository.findByProviderMessageId.mockResolvedValue(message);

    const command: HandleStatusCallbackCommand = {
      providerMessageId: 'SM123',
      status: 'delivered',
    };

    await useCase.execute(command);

    expect(messageRepository.findByProviderMessageId).toHaveBeenCalledWith('SM123');
    expect(messageRepository.save).toHaveBeenCalledTimes(1);

    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage).toBe(message);
    expect(savedMessage.deliveryStatus).toBe('sent');
    expect(savedMessage.sender).toBe(MessageSender.AGENT);
  });

  it('mapea "failed" y "undelivered" al mismo deliveryStatus de dominio "failed"', async () => {
    const message = aMessage();
    messageRepository.findByProviderMessageId.mockResolvedValue(message);

    await useCase.execute({ providerMessageId: 'SM123', status: 'undelivered' });

    expect(message.deliveryStatus).toBe('failed');
  });

  it('mensaje no encontrado: no lanza y no llama a save', async () => {
    messageRepository.findByProviderMessageId.mockResolvedValue(null);

    const command: HandleStatusCallbackCommand = {
      providerMessageId: 'SM-desconocido',
      status: 'sent',
    };

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('status desconocido/no mapeable: se ignora (loguea y retorna), sin consultar ni persistir', async () => {
    const command = {
      providerMessageId: 'SM123',
      status: 'queued' as unknown as TwilioMessageStatus,
    };

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.findByProviderMessageId).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
