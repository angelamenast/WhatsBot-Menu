import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Backend/ (este archivo vive en Backend/test/integration/support).
const BACKEND_DIR = resolve(__dirname, '..', '..', '..');
const ENV_TEST_PATH = resolve(BACKEND_DIR, '.env.test');
const ENV_PATH = resolve(BACKEND_DIR, '.env');

export interface TestEnv {
  url: string;
  serviceRoleKey: string;
}

export class IntegrationEnvError extends Error {
  constructor(reason: string) {
    super(
      `\n\n[test:int] ABORTADO: ${reason}\n` +
        'Las pruebas de integración escriben en la base de datos y solo pueden correr contra un proyecto\n' +
        'Supabase de PRUEBAS. Configura SUPABASE_TEST_URL y SUPABASE_TEST_SERVICE_ROLE_KEY en Backend/.env.test\n' +
        '(ver Backend/.env.test.example y Backend/test/integration/README.md).\n',
    );
    this.name = 'IntegrationEnvError';
  }
}

/** Variables de Backend/.env.test (vacío si no existe). */
export function readEnvTestFile(): Record<string, string> {
  return parseEnvFile(ENV_TEST_PATH);
}

// Parser mínimo de .env (KEY=valor, comentarios con #, comillas opcionales). Nunca imprime valores.
function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }
  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return vars;
}

const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase();

/**
 * Lee la configuración de pruebas SOLO de Backend/.env.test y aborta si falta o si apunta a la
 * misma base que Backend/.env (la compartida del equipo).
 */
export function loadTestEnv(): TestEnv {
  if (!existsSync(ENV_TEST_PATH)) {
    throw new IntegrationEnvError('no existe Backend/.env.test.');
  }

  const testVars = parseEnvFile(ENV_TEST_PATH);
  const url = testVars.SUPABASE_TEST_URL;
  const serviceRoleKey = testVars.SUPABASE_TEST_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new IntegrationEnvError(
      'faltan SUPABASE_TEST_URL y/o SUPABASE_TEST_SERVICE_ROLE_KEY en Backend/.env.test.',
    );
  }

  const sharedVars = parseEnvFile(ENV_PATH);
  const sharedUrls = [sharedVars.SUPABASE_URL, process.env.SUPABASE_URL].filter(
    (value): value is string => !!value,
  );
  const sharedKeys = [sharedVars.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(
    (value): value is string => !!value,
  );

  if (sharedUrls.some((shared) => normalizeUrl(shared) === normalizeUrl(url))) {
    throw new IntegrationEnvError(
      'SUPABASE_TEST_URL es igual a SUPABASE_URL (la base compartida del equipo).',
    );
  }
  if (sharedKeys.includes(serviceRoleKey)) {
    throw new IntegrationEnvError(
      'SUPABASE_TEST_SERVICE_ROLE_KEY es igual a SUPABASE_SERVICE_ROLE_KEY (la base compartida del equipo).',
    );
  }

  return { url, serviceRoleKey };
}
