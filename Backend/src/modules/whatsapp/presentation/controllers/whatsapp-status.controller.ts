import { Controller, Get, Inject, UseGuards, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../domain/repositories/whatsapp-connection.repository';
import type { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';

@Controller('whatsapp/connections')
@UseGuards(SupabaseAuthGuard)
export class WhatsappStatusController {
  constructor(
    private readonly business: BusinessService,
    @Inject(WHATSAPP_CONNECTION_REPOSITORY) private readonly connections: WhatsappConnectionRepository,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async get(@Req() request: { user: { id: string } }) {
    const business = await this.business.findByUsuario(request.user.id);
    if (!business) return null;
    const connection = await this.connections.findByBusinessId(business.id);
    if (!connection) return null;
    return { id: connection.id, phoneNumber: connection.phoneNumber, status: connection.status,
      simulated: (this.config.get<string>('PROVISIONING_PROVIDER') ?? 'fake') === 'fake' };
  }
}
