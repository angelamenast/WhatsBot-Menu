import { ConnectWhatsappUseCase } from './connect-whatsapp.use-case';
import { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import { ProvisioningPort } from '../ports/out/provisioning.port';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';
import { PhoneNumberAlreadyLinkedError } from '../../domain/errors/whatsapp.errors';
import { ConnectWhatsappCommand } from '../dto/connect-whatsapp.command';

describe('ConnectWhatsappUseCase', () => {
  let whatsappConnectionRepository: jest.Mocked<WhatsappConnectionRepository>;
  let provisioningPort: jest.Mocked<ProvisioningPort>;
  let useCase: ConnectWhatsappUseCase;

  const command: ConnectWhatsappCommand = {
    businessId: 'business-1',
    phoneNumber: '+573000000000',
  };

  beforeEach(() => {
    whatsappConnectionRepository = {
      findByBusinessId: jest.fn(),
      findByPhoneNumber: jest.fn(),
      save: jest.fn(),
    };
    provisioningPort = {
      provision: jest.fn(),
    };

    useCase = new ConnectWhatsappUseCase(whatsappConnectionRepository, provisioningPort);
  });

  it('número disponible + provisioning exitoso: crea la conexión y la persiste como CONNECTED', async () => {
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(null);
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(null);
    provisioningPort.provision.mockResolvedValue({
      status: 'connected',
      subaccountSid: 'AC123',
      senderSid: 'MG123',
    });

    const result = await useCase.execute(command);

    expect(provisioningPort.provision).toHaveBeenCalledWith(command.phoneNumber);
    expect(whatsappConnectionRepository.save).toHaveBeenCalledTimes(1);

    const savedConnection = whatsappConnectionRepository.save.mock.calls[0][0];
    expect(savedConnection.businessId).toBe(command.businessId);
    expect(savedConnection.phoneNumber).toBe(command.phoneNumber);
    expect(savedConnection.status).toBe(WhatsappConnectionStatus.CONNECTED);
    expect(savedConnection.twilioSubaccountSid).toBe('AC123');
    expect(savedConnection.twilioSenderSid).toBe('MG123');
    expect(result).toBe(savedConnection);
  });

  it('reutiliza y actualiza la conexión existente del negocio en vez de crear una nueva', async () => {
    const existingConnection = WhatsappConnection.create({
      id: 'connection-1',
      businessId: command.businessId,
      phoneNumber: '+573001112222',
      twilioSubaccountSid: 'AC-old',
      twilioSenderSid: 'MG-old',
      status: WhatsappConnectionStatus.CONNECTED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(null);
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(existingConnection);
    provisioningPort.provision.mockResolvedValue({
      status: 'connected',
      subaccountSid: 'AC-new',
      senderSid: 'MG-new',
    });

    const result = await useCase.execute(command);

    expect(result.id).toBe('connection-1');
    expect(result.phoneNumber).toBe(command.phoneNumber);
    expect(result.twilioSubaccountSid).toBe('AC-new');
    expect(result.twilioSenderSid).toBe('MG-new');
    expect(result.status).toBe(WhatsappConnectionStatus.CONNECTED);
  });

  it('número ya vinculado a otro negocio: lanza PhoneNumberAlreadyLinkedError y no llama a provisioning', async () => {
    const otherBusinessConnection = WhatsappConnection.create({
      id: 'connection-2',
      businessId: 'business-2',
      phoneNumber: command.phoneNumber,
      twilioSubaccountSid: 'AC999',
      twilioSenderSid: 'MG999',
      status: WhatsappConnectionStatus.CONNECTED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(otherBusinessConnection);

    await expect(useCase.execute(command)).rejects.toThrow(PhoneNumberAlreadyLinkedError);

    expect(whatsappConnectionRepository.findByBusinessId).not.toHaveBeenCalled();
    expect(provisioningPort.provision).not.toHaveBeenCalled();
    expect(whatsappConnectionRepository.save).not.toHaveBeenCalled();
  });

  it('provisioning falla: persiste la conexión como FAILED sin lanzar', async () => {
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(null);
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(null);
    provisioningPort.provision.mockResolvedValue({ status: 'failed' });

    const result = await useCase.execute(command);

    expect(whatsappConnectionRepository.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(WhatsappConnectionStatus.FAILED);
    expect(result.twilioSubaccountSid).toBeNull();
    expect(result.twilioSenderSid).toBeNull();
  });

  it('provisioning lanza una excepción: se captura y persiste la conexión como FAILED sin propagar', async () => {
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(null);
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(null);
    provisioningPort.provision.mockRejectedValue(new Error('Twilio no disponible'));

    await expect(useCase.execute(command)).resolves.toMatchObject({
      status: WhatsappConnectionStatus.FAILED,
    });

    expect(whatsappConnectionRepository.save).toHaveBeenCalledTimes(1);
  });
});
