import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanStatusPort } from '../../application/ports/out/plan-status.port';

@Injectable()
export class FakePlanStatusProvider implements PlanStatusPort {
  constructor(private readonly configService: ConfigService) {}

  async isActive(_businessId: string): Promise<boolean> {
    const forceInactive = this.configService.get<string>('PLAN_STATUS_FORCE_INACTIVE') === 'true';

    return !forceInactive;
  }
}
