import { ProvisioningPort, ProvisioningResult } from '../../application/ports/out/provisioning.port';
import { normalizePhoneNumber } from '../../domain/phone-number';
import { MetaGraphClient } from './meta-graph.client';

/**
 * Ya no aprovisiona: comprueba que el número existe en Meta (y que el token tiene acceso a él)
 * y devuelve su número visible.
 */
export class MetaProvisioningAdapter implements ProvisioningPort {
  constructor(private readonly graphClient: MetaGraphClient) {}

  async link(phoneNumberId: string): Promise<ProvisioningResult> {
    const payload = await this.graphClient.request({
      method: 'GET',
      path: `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
    });

    const displayPhoneNumber =
      typeof payload === 'object' &&
      payload !== null &&
      'display_phone_number' in payload &&
      typeof payload.display_phone_number === 'string'
        ? payload.display_phone_number
        : '';

    if (normalizePhoneNumber(displayPhoneNumber) === '') {
      return { status: 'failed' };
    }

    return { status: 'connected', displayPhoneNumber };
  }
}
