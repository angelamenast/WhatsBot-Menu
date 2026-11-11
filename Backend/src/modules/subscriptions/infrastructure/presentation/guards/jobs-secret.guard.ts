import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const HEADER_JOBS_SECRET = 'x-jobs-secret';

// Comparación en tiempo constante: se comparan los hash para que la longitud no importe.
function sonIguales(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// Protege los endpoints que dispara un cron externo (no hay usuario, así que no aplica
// SupabaseAuthGuard). El cron envía el header x-jobs-secret con el valor de JOBS_SECRET.
@Injectable()
export class JobsSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secreto = this.configService.get<string>('JOBS_SECRET');
    if (!secreto) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Los jobs externos no están habilitados en este entorno.',
        codigo: 'JOBS_DESHABILITADOS',
      });
    }

    const recibido = context.switchToHttp().getRequest<Request>().headers[HEADER_JOBS_SECRET];
    if (typeof recibido !== 'string' || !sonIguales(recibido, secreto)) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Secreto de job inválido.',
        codigo: 'JOB_NO_AUTORIZADO',
      });
    }

    return true;
  }
}
