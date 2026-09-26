import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!authToken) {
      this.logger.warn(
        'TWILIO_AUTH_TOKEN no está definido: se omite la validación de firma de Twilio (solo para desarrollo local)',
      );
      return true;
    }

    const signature = request.headers['x-twilio-signature'];

    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Falta el header X-Twilio-Signature');
    }

    const url = `${request.protocol}://${request.get('host')}${request.originalUrl}`;
    const expectedSignature = this.computeSignature(authToken, url, request.body ?? {});

    if (!this.signaturesMatch(signature, expectedSignature)) {
      throw new UnauthorizedException('Firma de Twilio inválida');
    }

    return true;
  }

  private computeSignature(authToken: string, url: string, params: Record<string, unknown>): string {
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + String(params[key]), url);

    return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  }

  private signaturesMatch(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
