import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { SupabaseService } from '../../../src/shared/supabase/supabase.service';
import { loadTestEnv } from './env';
import type { WompiTestEnv } from './wompi-env';

/**
 * ConfigService cerrado: solo estas claves existen. No se lee nada de Backend/.env (la base y
 * las llaves compartidas), aunque ConfigModule lo cargue en process.env.
 */
export function closedConfig(values: Record<string, string>): ConfigService {
  const get = (key: string, defaultValue?: unknown) => (key in values ? values[key] : defaultValue);
  const getOrThrow = (key: string) => {
    if (!(key in values)) throw new Error(`[test:int] Config "${key}" no definida para las pruebas`);
    return values[key];
  };
  return { get, getOrThrow } as unknown as ConfigService;
}

/** Valores de la app para las pruebas: Supabase y Wompi de pruebas, todo lo demás en fake. */
export function testAppConfig(wompi: WompiTestEnv): Record<string, string> {
  const supabase = loadTestEnv();
  return {
    SUPABASE_URL: supabase.url,
    SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
    WOMPI_BASE_URL: wompi.baseUrl,
    WOMPI_PUBLIC_KEY: wompi.publicKey,
    WOMPI_PRIVATE_KEY: wompi.privateKey,
    WOMPI_EVENTS_SECRET: wompi.eventsSecret,
    WOMPI_REDIRECT_URL: 'http://localhost:4321/billing',
    FRONTEND_URL: 'http://localhost:4321',
    MESSAGING_PROVIDER: 'fake',
    PROVISIONING_PROVIDER: 'fake',
    PLAN_STATUS_PROVIDER: 'fake',
    AGENT_DISPATCH_PROVIDER: 'fake',
    LLM_PROVIDER: 'fake',
    USAGE_QUOTA_PROVIDER: 'fake',
    ORDER_PROVIDER: 'fake',
    CATALOG_PROVIDER: 'fake',
    EMAIL_PROVIDER: 'log',
    VENCIMIENTOS_JOB_ENABLED: 'false',
  };
}

const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase();

/** AppModule completo, con el mismo prefijo, pipes y rawBody que main.ts. */
export async function createTestApp(config: Record<string, string>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue(closedConfig(config))
    .compile();

  const app = moduleRef.createNestApplication({ rawBody: true, logger: ['error'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  // Doble seguro: la app debe hablar con la base de pruebas, no con la compartida.
  const client = app.get(SupabaseService).getClient() as unknown as { supabaseUrl: string };
  if (normalizeUrl(String(client.supabaseUrl)) !== normalizeUrl(config.SUPABASE_URL)) {
    await app.close();
    throw new Error('[test:int] ABORTADO: la app no quedó apuntando a la base de pruebas.');
  }
  return app;
}
