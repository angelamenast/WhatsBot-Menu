import { Inject, Injectable, Logger } from '@nestjs/common';
import type { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../domain/repositories/whatsapp-connection.repository';
import type { ProvisioningPort } from '../ports/out/provisioning.port';
import { PROVISIONING_PORT } from '../ports/out/provisioning.port';
import { WhatsappConnection } from '../../domain/entities/whatsapp-connection.entity';
import { PhoneNumberAlreadyLinkedError } from '../../domain/errors/whatsapp.errors';
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

  async execute(command: ConnectWhatsappCommand): Promise<WhatsappConnection> {
    const existingByPhoneNumber = await this.whatsappConnectionRepository.findByPhoneNumber(
      command.phoneNumber,
    );

    if (existingByPhoneNumber && existingByPhoneNumber.businessId !== command.businessId) {
      throw new PhoneNumberAlreadyLinkedError(command.phoneNumber);
    }

    const existingByBusiness = await this.whatsappConnectionRepository.findByBusinessId(
      command.businessId,
    );

    let connection: WhatsappConnection;

    if (existingByBusiness) {
      existingByBusiness.requestReconnect(command.phoneNumber);
      connection = existingByBusiness;
    } else {
      connection = WhatsappConnection.request({
        businessId: command.businessId,
        phoneNumber: command.phoneNumber,
      });
    }

    try {
      const result = await this.provisioningPort.provision(command.phoneNumber);

      if (result.status === 'connected') {
        connection.markConnected(result.subaccountSid, result.senderSid);
      } else {
        connection.markFailed();
      }
    } catch (error) {
      this.logger.error(
        `Fallo al aprovisionar el número ${command.phoneNumber} para el negocio ${command.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      connection.markFailed();
    }

    await this.whatsappConnectionRepository.save(connection);

    return connection;
  }
}
