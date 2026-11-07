import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { MetaSignatureGuard } from '../guards/meta-signature.guard';
import { parseMetaWebhook } from '../parsers/meta-webhook.parser';
import type { ParsedMetaWebhook } from '../parsers/meta-webhook.parser';
import { secureCompare } from '../utils/secure-compare';
import { HandleIncomingMessageUseCase } from '../../application/use-cases/handle-incoming-message.use-case';
import { HandleStatusCallbackUseCase } from '../../application/use-cases/handle-status-callback.use-case';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';

// Meta llama desde IPs compartidas por todos los negocios: el throttler global (por IP) lo cortaría con 429.
// La firma de Meta (MetaSignatureGuard) es la protección del POST; el GET exige el token de verificación.
@SkipThrottle()
@Controller('whatsapp/webhook')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly handleIncomingMessageUseCase: HandleIncomingMessageUseCase,
    private readonly handleStatusCallbackUseCase: HandleStatusCallbackUseCase,
  ) {}

  /** Verificación del webhook al registrarlo en Meta: devuelve el challenge en texto plano. */
  @Get()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode !== 'subscribe' || !verifyToken || !token || !challenge || !secureCompare(token, verifyToken)) {
      throw new ForbiddenException();
    }

    return challenge;
  }

  /**
   * Responde 200 de inmediato y procesa en segundo plano: el ack no depende de la latencia del
   * agente/LLM y Meta no reintenta. El `body` va sin tipar a propósito (el ValidationPipe global
   * no lo toca); el parser propio descarta lo que no entiende.
   */
  @Post()
  @UseGuards(MetaSignatureGuard)
  @HttpCode(200)
  receive(@Body() body: unknown): void {
    const parsed = parseMetaWebhook(body);

    if (parsed.unsupportedMessageTypes.length > 0) {
      this.logger.warn(
        `Se ignoraron ${parsed.unsupportedMessageTypes.length} mensaje(s) no textuales (tipos: ${[
          ...new Set(parsed.unsupportedMessageTypes),
        ].join(', ')})`,
      );
    }

    void this.process(parsed).catch((error: unknown) => {
      this.logger.error(`Fallo inesperado procesando el webhook: ${this.describe(error)}`);
    });
  }

  /** Secuencial para respetar el orden de llegada; cada ítem aísla su propio error. */
  private async process(parsed: ParsedMetaWebhook): Promise<void> {
    for (const message of parsed.messages) {
      try {
        await this.handleIncomingMessageUseCase.execute(message);
      } catch (error) {
        if (error instanceof WhatsappConnectionNotFoundError) {
          this.logger.warn(
            `Webhook recibido para un número no registrado (providerMessageId=${message.providerMessageId})`,
          );
        } else {
          this.logger.error(
            `Fallo procesando el mensaje ${message.providerMessageId}: ${this.describe(error)}`,
          );
        }
      }
    }

    for (const status of parsed.statuses) {
      try {
        await this.handleStatusCallbackUseCase.execute(status);
      } catch (error) {
        this.logger.error(
          `Fallo procesando el estado del mensaje ${status.providerMessageId}: ${this.describe(error)}`,
        );
      }
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
