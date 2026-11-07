import { ConnectWhatsappUseCase } from './connect-whatsapp.use-case';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
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
    phoneNumberId: '106540352242922',
    wabaId: '102290129340398',
  };

  const aConnection = (overrides: { businessId?: string; phoneNumberId?: string; phoneNumber?: string | null } = {}) =>
    WhatsappConnection.create({
      id: 'connection-1',
      businessId: overrides.businessId ?? command.businessId,
      phoneNumberId: overrides.phoneNumberId ?? command.phoneNumberId,
      wabaId: command.wabaId,
      phoneNumber: overrides.phoneNumber === undefined ? '15550253483' : overrides.phoneNumber,
      status: WhatsappConnectionStatus.CONNECTED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    whatsappConnectionRepository = {
      findByBusinessId: jest.fn(),
      findByPhoneNumber: jest.fn(),
      findByPhoneNumberId: jest.fn(),
      save: jest.fn(),
    };
    provisioningPort = {
      link: jest.fn(),
    };

    whatsappConnectionRepository.findByPhoneNumberId.mockResolvedValue(null);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(null);
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(null);

    useCase = new ConnectWhatsappUseCase(whatsappConnectionRepository, provisioningPort);
  });

  it('número disponible + vinculación exitosa: persiste la conexión CONNECTED con el número visible normalizado', async () => {
    provisioningPort.link.mockResolvedValue({ status: 'connected', displayPhoneNumber: '+1 555-025-3483' });

    const result = await useCase.execute(command);

    expect(provisioningPort.link).toHaveBeenCalledWith(command.phoneNumberId);
    expect(whatsappConnectionRepository.findByPhoneNumber).toHaveBeenCalledWith('15550253483');
    expect(whatsappConnectionRepository.save).toHaveBeenCalledTimes(1);

    const savedConnection = whatsappConnectionRepository.save.mock.calls[0][0];
    expect(savedConnection.businessId).toBe(command.businessId);
    expect(savedConnection.phoneNumberId).toBe(command.phoneNumberId);
    expect(savedConnection.wabaId).toBe(command.wabaId);
    expect(savedConnection.phoneNumber).toBe('15550253483');
    expect(savedConnection.status).toBe(WhatsappConnectionStatus.CONNECTED);
    expect(result).toBe(savedConnection);
  });

  it('reutiliza y actualiza la conexión existente del negocio en vez de crear una nueva', async () => {
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(
      aConnection({ phoneNumberId: '999', phoneNumber: '573001112222' }),
    );
    provisioningPort.link.mockResolvedValue({ status: 'connected', displayPhoneNumber: '+1 555-025-3483' });

    const result = await useCase.execute(command);

    expect(result.id).toBe('connection-1');
    expect(result.phoneNumberId).toBe(command.phoneNumberId);
    expect(result.phoneNumber).toBe('15550253483');
    expect(result.status).toBe(WhatsappConnectionStatus.CONNECTED);
  });

  it('phone_number_id ya vinculado a otro negocio: lanza PhoneNumberAlreadyLinkedError sin llamar al proveedor ni guardar', async () => {
    whatsappConnectionRepository.findByPhoneNumberId.mockResolvedValue(aConnection({ businessId: 'business-2' }));

    await expect(useCase.execute(command)).rejects.toThrow(PhoneNumberAlreadyLinkedError);

    expect(provisioningPort.link).not.toHaveBeenCalled();
    expect(whatsappConnectionRepository.save).not.toHaveBeenCalled();
  });

  it('el mismo negocio puede volver a vincular su propio phone_number_id', async () => {
    whatsappConnectionRepository.findByPhoneNumberId.mockResolvedValue(aConnection());
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(aConnection());
    provisioningPort.link.mockResolvedValue({ status: 'connected', displayPhoneNumber: '+1 555-025-3483' });

    await expect(useCase.execute(command)).resolves.toMatchObject({
      status: WhatsappConnectionStatus.CONNECTED,
    });
  });

  it('número visible ya vinculado a otro negocio: lanza PhoneNumberAlreadyLinkedError y no guarda', async () => {
    provisioningPort.link.mockResolvedValue({ status: 'connected', displayPhoneNumber: '+1 555-025-3483' });
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(
      aConnection({ businessId: 'business-2', phoneNumberId: '777' }),
    );

    await expect(useCase.execute(command)).rejects.toThrow(PhoneNumberAlreadyLinkedError);

    expect(whatsappConnectionRepository.save).not.toHaveBeenCalled();
  });

  it('el proveedor responde failed: persiste la conexión como FAILED, sin número visible y sin lanzar', async () => {
    provisioningPort.link.mockResolvedValue({ status: 'failed' });

    const result = await useCase.execute(command);

    expect(whatsappConnectionRepository.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(WhatsappConnectionStatus.FAILED);
    expect(result.phoneNumber).toBeNull();
    expect(result.phoneNumberId).toBe(command.phoneNumberId);
    expect(whatsappConnectionRepository.findByPhoneNumber).not.toHaveBeenCalled();
  });

  it('el proveedor lanza una excepción: se captura y persiste la conexión como FAILED sin propagar', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    provisioningPort.link.mockRejectedValue(new Error('Graph API no disponible'));

    await expect(useCase.execute(command)).resolves.toMatchObject({
      status: WhatsappConnectionStatus.FAILED,
    });

    expect(whatsappConnectionRepository.save).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('el log del fallo identifica el negocio y NO contiene los identificadores de Meta', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    provisioningPort.link.mockRejectedValue(new Error('Graph API no disponible'));

    await useCase.execute(command);

    const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logged).toContain(command.businessId);
    expect(logged).not.toContain(command.phoneNumberId);
    expect(logged).not.toContain(command.wabaId);

    errorSpy.mockRestore();
  });
});
