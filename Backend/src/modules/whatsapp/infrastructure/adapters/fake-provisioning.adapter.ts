import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ProvisioningPort, ProvisioningResult } from '../../application/ports/out/provisioning.port';

@Injectable()
export class FakeProvisioningProvider implements ProvisioningPort {
  private readonly logger = new Logger(FakeProvisioningProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async provision(phoneNumber: string): Promise<ProvisioningResult> {
    const forceFail = this.configService.get<string>('FAKE_PROVISIONING_FORCE_FAIL') === 'true';

    if (forceFail) {
      this.logger.warn(`[FakeProvisioningProvider] Aprovisionamiento simulado FALLIDO para ${phoneNumber}`);
      return { status: 'failed' };
    }

    const subaccountSid = randomUUID();
    const senderSid = randomUUID();

    this.logger.log(
      `[FakeProvisioningProvider] Aprovisionamiento simulado para ${phoneNumber} (subaccountSid=${subaccountSid}, senderSid=${senderSid})`,
    );
    return { status: 'connected', subaccountSid, senderSid };
  }
}
