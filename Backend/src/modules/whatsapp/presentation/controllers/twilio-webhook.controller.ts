import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';
import { TwilioWebhookDto } from '../dto/twilio-webhook.dto';
import { HandleIncomingMessageUseCase } from '../../application/use-cases/handle-incoming-message.use-case';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';

@Controller('whatsapp/webhook')
@UseGuards(TwilioSignatureGuard)
export class TwilioWebhookController {
  private readonly logger = new Logger(TwilioWebhookController.name);

  constructor(private readonly handleIncomingMessageUseCase: HandleIncomingMessageUseCase) {}

  @Post()
  @HttpCode(200)
  async receive(@Body() dto: TwilioWebhookDto): Promise<void> {
    try {
      await this.handleIncomingMessageUseCase.execute({
        toPhoneNumber: dto.To,
        fromCustomerNumber: dto.From,
        body: dto.Body,
        providerMessageId: dto.MessageSid,
      });
    } catch (error) {
      if (error instanceof WhatsappConnectionNotFoundError) {
        this.logger.warn(
          `Webhook recibido para un número no registrado (${dto.To}): ${error.message}`,
        );
        return;
      }

      throw error;
    }
  }
}
