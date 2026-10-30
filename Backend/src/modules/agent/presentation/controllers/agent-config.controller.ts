import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { PlanActivoGuard } from '../../../subscriptions/infrastructure/presentation/guards/plan-activo.guard';
import { GetAgentConfigUseCase } from '../../application/use-cases/get-agent-config.use-case';
import { UpdateAgentConfigUseCase } from '../../application/use-cases/update-agent-config.use-case';
import { UpdateAgentConfigRequestDto } from '../dto/update-agent-config-request.dto';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import type { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';

interface AgentConfigResponse {
  businessId: string;
  personality: string | null;
  tone: AgentTone | null;
  regionalStyle: AgentRegionalStyle | null;
  welcomeMessage: string | null;
  unavailableMessage: string | null;
  businessHours: Record<string, unknown> | null;
}

function toResponse(config: AgentConfig): AgentConfigResponse {
  return {
    businessId: config.businessId,
    personality: config.personality,
    tone: config.tone,
    regionalStyle: config.regionalStyle,
    welcomeMessage: config.welcomeMessage,
    unavailableMessage: config.unavailableMessage,
    businessHours: config.businessHours,
  };
}

@Controller('agent/config')
@UseGuards(SupabaseAuthGuard)
export class AgentConfigController {
  constructor(
    private readonly getAgentConfigUseCase: GetAgentConfigUseCase,
    private readonly updateAgentConfigUseCase: UpdateAgentConfigUseCase,
    private readonly businessService: BusinessService,
  ) {}

  @Get()
  async get(
    @Req() request: Request & { user: { id: string } },
  ): Promise<AgentConfigResponse> {
    const business = await this.businessService.findByUsuario(request.user.id);

    if (!business) {
      throw new NotFoundException('No tienes un negocio registrado');
    }

    const config = await this.getAgentConfigUseCase.execute(business.id);
    return toResponse(config);
  }

  // Con el plan vencido el dashboard es de solo lectura (HU-8.5).
  @Patch()
  @UseGuards(PlanActivoGuard)
  async update(
    @Req() request: Request & { user: { id: string } },
    @Body() dto: UpdateAgentConfigRequestDto,
  ): Promise<AgentConfigResponse> {
    const business = await this.businessService.findByUsuario(request.user.id);

    if (!business) {
      throw new NotFoundException('No tienes un negocio registrado');
    }

    const config = await this.updateAgentConfigUseCase.execute({
      businessId: business.id,
      personality: dto.personality,
      tone: dto.tone,
      regionalStyle: dto.regionalStyle,
      welcomeMessage: dto.welcomeMessage,
      unavailableMessage: dto.unavailableMessage,
      businessHours: dto.businessHours,
    });

    return toResponse(config);
  }
}
