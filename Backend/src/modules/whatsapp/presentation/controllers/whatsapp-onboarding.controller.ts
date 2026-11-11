import {
  Body,
  ConflictException,
  Controller,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { PlanActivoGuard } from '../../../subscriptions/infrastructure/presentation/guards/plan-activo.guard';
import { ConnectWhatsappUseCase } from '../../application/use-cases/connect-whatsapp.use-case';
import { ConnectWhatsappRequestDto } from '../dto/connect-whatsapp-request.dto';
import { PhoneNumberAlreadyLinkedError } from '../../domain/errors/whatsapp.errors';
import { WhatsappConnectionStatus } from '../../domain/entities/whatsapp-connection.entity';

@Controller('whatsapp/connections')
@UseGuards(SupabaseAuthGuard)
export class WhatsappOnboardingController {
  constructor(
    private readonly connectWhatsappUseCase: ConnectWhatsappUseCase,
    private readonly businessService: BusinessService,
  ) {}

  // Con el plan vencido el dashboard es de solo lectura (HU-8.5). SIN_PLAN sí pasa el
  // guard, así que el onboarding (registro → negocio → plan → conexión) no se bloquea.
  @Post()
  @UseGuards(PlanActivoGuard)
  async connect(
    @Req() request: Request & { user: { id: string } },
    @Body() dto: ConnectWhatsappRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const business = await this.businessService.findByUsuario(request.user.id);

    if (!business) {
      throw new NotFoundException('No tienes un negocio registrado');
    }

    try {
      const connection = await this.connectWhatsappUseCase.execute({
        businessId: business.id,
        phoneNumberId: dto.phoneNumberId,
        wabaId: dto.wabaId,
      });

      res.status(
        connection.status === WhatsappConnectionStatus.FAILED ? HttpStatus.OK : HttpStatus.CREATED,
      );

      return {
        id: connection.id,
        businessId: connection.businessId,
        phoneNumberId: connection.phoneNumberId,
        wabaId: connection.wabaId,
        phoneNumber: connection.phoneNumber,
        status: connection.status,
      };
    } catch (error) {
      if (error instanceof PhoneNumberAlreadyLinkedError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
