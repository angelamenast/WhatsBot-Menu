import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProvisioningPort, ProvisioningResult } from '../../application/ports/out/provisioning.port';
import { normalizePhoneNumber } from '../../domain/phone-number';

@Injectable()
export class FakeProvisioningProvider implements ProvisioningPort {
  private readonly logger = new Logger(FakeProvisioningProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async link(phoneNumberId: string): Promise<ProvisioningResult> {
    const forceFail = this.configService.get<string>('FAKE_PROVISIONING_FORCE_FAIL') === 'true';

    if (forceFail) {
      this.logger.warn('[FakeProvisioningProvider] Vinculación simulada FALLIDA');
      return { status: 'failed' };
    }

    // Derivado del phone_number_id: distinto por número (numero_whatsapp es único) y estable entre llamadas.
    const displayPhoneNumber = `1${normalizePhoneNumber(phoneNumberId).slice(-10).padStart(10, '0')}`;

    this.logger.log('[FakeProvisioningProvider] Vinculación simulada');
    return { status: 'connected', displayPhoneNumber };
  }
}
