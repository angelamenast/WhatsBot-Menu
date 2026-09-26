import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';
import { TwilioStatusCallbackDto } from '../dto/twilio-status-callback.dto';
import { HandleStatusCallbackUseCase } from '../../application/use-cases/handle-status-callback.use-case';
import type { TwilioMessageStatus } from '../../application/dto/handle-status-callback.command';

@Controller('whatsapp/status-callback')
@UseGuards(TwilioSignatureGuard)
export class TwilioStatusCallbackController {
  constructor(private readonly handleStatusCallbackUseCase: HandleStatusCallbackUseCase) {}

  @Post()
  @HttpCode(200)
  async receive(@Body() dto: TwilioStatusCallbackDto): Promise<void> {
    await this.handleStatusCallbackUseCase.execute({
      providerMessageId: dto.MessageSid,
      // Cast solo para satisfacer el tipo del command; no valida nada por sí mismo.
      // La validación real (mapeo/descarte de status desconocidos) ocurre en handle-status-callback.use-case.ts.
      status: dto.MessageStatus as TwilioMessageStatus,
    });
  }
}
