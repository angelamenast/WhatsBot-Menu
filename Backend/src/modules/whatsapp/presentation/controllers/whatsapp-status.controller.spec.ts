import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { WhatsappStatusController } from './whatsapp-status.controller';
import type { BusinessService } from '../../../business/business.service';
import type { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';

describe('WhatsappStatusController', () => {
  const findByUsuario = jest.fn<(...args: any[]) => Promise<any>>();
  const findByBusinessId = jest.fn<(...args: any[]) => Promise<any>>();
  const controller = new WhatsappStatusController(
    { findByUsuario } as unknown as BusinessService,
    { findByBusinessId } as unknown as WhatsappConnectionRepository,
    new ConfigService({ PROVISIONING_PROVIDER: 'fake' }),
  );
  beforeEach(() => { jest.clearAllMocks(); });
  it('no consulta conexiones de otra cuenta ni expone identificadores del proveedor', async () => {
    findByUsuario.mockResolvedValue({ id: 'own-business' });
    findByBusinessId.mockResolvedValue({ id: 'connection', phoneNumber: '+573001234567', status: 'CONNECTED', twilioSubaccountSid: 'private' });
    const result = await controller.get({ user: { id: 'owner' } });
    expect(findByUsuario).toHaveBeenCalledWith('owner');
    expect(findByBusinessId).toHaveBeenCalledWith('own-business');
    expect(result).toEqual({ id: 'connection', phoneNumber: '+573001234567', status: 'CONNECTED', simulated: true });
  });
  it('devuelve null cuando el usuario no tiene negocio', async () => {
    findByUsuario.mockResolvedValue(null);
    expect(await controller.get({ user: { id: 'new-user' } })).toBeNull();
    expect(findByBusinessId).not.toHaveBeenCalled();
  });
});
