import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { secureCompare } from '../utils/secure-compare';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Valida X-Hub-Signature-256: HMAC-SHA256 del cuerpo CRUDO con el App Secret. Falla cerrada: sin
 * secreto, sin cabecera o sin cuerpo crudo (requiere `rawBody: true` en main.ts) rechaza siempre.
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');

    if (!appSecret) {
      this.logger.error('WHATSAPP_APP_SECRET no está definido: se rechazan todos los webhooks de Meta');
      throw new UnauthorizedException('Firma inválida');
    }

    const signature = request.headers['x-hub-signature-256'];

    if (typeof signature !== 'string' || !signature.startsWith(SIGNATURE_PREFIX)) {
      throw new UnauthorizedException('Firma inválida');
    }

    if (!request.rawBody) {
      this.logger.error('El cuerpo crudo no está disponible: falta rawBody: true en NestFactory.create');
      throw new UnauthorizedException('Firma inválida');
    }

    const expected = SIGNATURE_PREFIX + createHmac('sha256', appSecret).update(request.rawBody).digest('hex');

    if (!secureCompare(signature, expected)) {
      throw new UnauthorizedException('Firma inválida');
    }

    return true;
  }
}
