import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { revisarEntornoProduccion } from './config/production-env';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Railway define RAILWAY_ENVIRONMENT_NAME en tiempo de ejecución; NODE_ENV=production sirve en otros hosts.
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME) {
    const { faltantes, advertencias } = revisarEntornoProduccion(process.env);
    advertencias.forEach((aviso) => logger.warn(aviso));
    if (faltantes.length > 0) {
      throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
    }
  }

  // rawBody: MetaSignatureGuard firma sobre el cuerpo crudo del webhook de WhatsApp.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Detrás del proxy de Railway/Render: sin esto todos los clientes comparten la IP del proxy
  // y el ThrottlerGuard (límite por IP) los cuenta como uno solo.
  app.set('trust proxy', 1);
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:4321',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
  logger.log(`API escuchando en el puerto ${process.env.PORT ?? 3000}`);
}
bootstrap();
