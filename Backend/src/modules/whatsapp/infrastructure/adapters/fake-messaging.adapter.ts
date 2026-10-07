import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { MessagingPort, SendMessageResult } from '../../application/ports/out/messaging.port';

@Injectable()
export class FakeMessagingProvider implements MessagingPort {
  private readonly logger = new Logger(FakeMessagingProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(to: string, body: string): Promise<SendMessageResult> {
    const forceFail = this.configService.get<string>('FAKE_MESSAGING_FORCE_FAIL') === 'true';

    if (forceFail) {
      this.logger.warn(`[FakeMessagingProvider] Envío simulado FALLIDO a ${to}: "${body}"`);
      return { providerMessageId: null, status: 'failed' };
    }

    const providerMessageId = randomUUID();
    this.logger.log(
      `[FakeMessagingProvider] Envío simulado a ${to} (providerMessageId=${providerMessageId}): "${body}"`,
    );
    return { providerMessageId, status: 'sent' };
  }
}
