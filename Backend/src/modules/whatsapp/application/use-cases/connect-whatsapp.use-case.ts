import { Inject, Injectable, Logger } from '@nestjs/common';
import type { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../domain/repositories/whatsapp-connection.repository';
import type { ProvisioningPort, ProvisioningResult } from '../ports/out/provisioning.port';
import { PROVISIONING_PORT } from '../ports/out/provisioning.port';
import { WhatsappConnection } from '../../domain/entities/whatsapp-connection.entity';
import { PhoneNumberAlreadyLinkedError } from '../../domain/errors/whatsapp.errors';
import { normalizePhoneNumber } from '../../domain/phone-number';
import { ConnectWhatsappCommand } from '../dto/connect-whatsapp.command';

@Injectable()
export class ConnectWhatsappUseCase {
  private readonly logger = new Logger(ConnectWhatsappUseCase.name);

  constructor(
    @Inject(WHATSAPP_CONNECTION_REPOSITORY)
    private readonly whatsappConnectionRepository: WhatsappConnectionRepository,
    @Inject(PROVISIONING_PORT)
    private readonly provisioningPort: ProvisioningPort,
  ) {}

  /** Vincula un número que ya existe en el proveedor: lo valida y guarda su número visible. */
  async execute(command: ConnectWhatsappCommand): Promise<WhatsappConnection> {
    const existingByPhoneNumberId = await this.whatsappConnectionRepository.findByPhoneNumberId(
      command.phoneNumberId,
    );

    if (existingByPhoneNumberId && existingByPhoneNumberId.businessId !== command.businessId) {
      throw new PhoneNumberAlreadyLinkedError(command.phoneNumberId);
    }

    const existingByBusiness = await this.whatsappConnectionRepository.findByBusinessId(
      command.businessId,
    );

    let connection: WhatsappConnection;

    if (existingByBusiness) {
      existingByBusiness.requestReconnect(command.phoneNumberId, command.wabaId);
      connection = existingByBusiness;
    } else {
      connection = WhatsappConnection.request({
        businessId: command.businessId,
        phoneNumberId: command.phoneNumberId,
        wabaId: command.wabaId,
      });
    }

    const result = await this.link(command);

    if (result.status === 'connected') {
      const phoneNumber = normalizePhoneNumber(result.displayPhoneNumber);

      // El número visible solo se conoce tras consultar al proveedor: su unicidad se comprueba aquí.
      const existingByPhoneNumber = await this.whatsappConnectionRepository.findByPhoneNumber(phoneNumber);

      if (existingByPhoneNumber && existingByPhoneNumber.businessId !== command.businessId) {
        throw new PhoneNumberAlreadyLinkedError(phoneNumber);
      }

      connection.markConnected(phoneNumber);
    } else {
      connection.markFailed();
    }

    await this.whatsappConnectionRepository.save(connection);

    return connection;
  }

  private async link(command: ConnectWhatsappCommand): Promise<ProvisioningResult> {
    try {
      return await this.provisioningPort.link(command.phoneNumberId);
    } catch (error) {
      this.logger.error(
        `Fallo al vincular la conexión de WhatsApp del negocio ${command.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'failed' };
    }
  }
}
