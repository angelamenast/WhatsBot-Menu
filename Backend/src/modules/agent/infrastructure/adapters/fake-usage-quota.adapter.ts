import { Injectable } from '@nestjs/common';
import { UsageQuotaPort } from '../../application/ports/out/usage-quota.port';

@Injectable()
export class FakeUsageQuotaProvider implements UsageQuotaPort {
  async hasQuota(_businessId: string): Promise<boolean> {
    return true;
  }
}
