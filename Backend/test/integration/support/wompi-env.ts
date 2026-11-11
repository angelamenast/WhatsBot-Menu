import { readEnvTestFile } from './env';

export interface WompiTestEnv {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
  eventsSecret: string;
}

export class WompiEnvError extends Error {
  constructor(reason: string) {
    super(
      `\n\n[test:int] ABORTADO (Wompi): ${reason}\n` +
        'Las pruebas de Wompi solo corren contra el sandbox con llaves de pruebas. Revisa las\n' +
        'variables WOMPI_TEST_* de Backend/.env.test (ver Backend/.env.test.example).\n',
    );
    this.name = 'WompiEnvError';
  }
}

const VARIABLES = [
  'WOMPI_TEST_BASE_URL',
  'WOMPI_TEST_PUBLIC_KEY',
  'WOMPI_TEST_PRIVATE_KEY',
  'WOMPI_TEST_EVENTS_SECRET',
] as const;

/**
 * Config de Wompi sandbox, leída solo de Backend/.env.test.
 * - Si faltan variables devuelve null: las suites de Wompi se saltan con aviso.
 * - Si alguna apunta a producción lanza WompiEnvError: la suite aborta.
 *
 * Llaves: pub_/prv_ deben contener "_test_". El secret de eventos de Wompi tiene la forma
 * "test_events_..." (no contiene "_test_"), así que para él se exige el prefijo "test_".
 */
export function loadWompiTestEnv(): WompiTestEnv | null {
  const vars = readEnvTestFile();
  const faltan = VARIABLES.filter((name) => !vars[name]);
  if (faltan.length > 0) {
    return null;
  }

  const env: WompiTestEnv = {
    baseUrl: vars.WOMPI_TEST_BASE_URL.replace(/\/+$/, ''),
    publicKey: vars.WOMPI_TEST_PUBLIC_KEY,
    privateKey: vars.WOMPI_TEST_PRIVATE_KEY,
    eventsSecret: vars.WOMPI_TEST_EVENTS_SECRET,
  };

  if (!env.baseUrl.toLowerCase().includes('sandbox')) {
    throw new WompiEnvError('WOMPI_TEST_BASE_URL no es la URL del sandbox (debe contener "sandbox").');
  }
  if (!env.publicKey.includes('_test_')) {
    throw new WompiEnvError('WOMPI_TEST_PUBLIC_KEY no es una llave de pruebas (debe contener "_test_").');
  }
  if (!env.privateKey.includes('_test_')) {
    throw new WompiEnvError('WOMPI_TEST_PRIVATE_KEY no es una llave de pruebas (debe contener "_test_").');
  }
  if (!env.eventsSecret.startsWith('test_') && !env.eventsSecret.includes('_test_')) {
    throw new WompiEnvError('WOMPI_TEST_EVENTS_SECRET no es un secret de pruebas (debe empezar por "test_").');
  }

  return env;
}

/**
 * describe o describe.skip según haya config de Wompi; avisa si se salta. describe.skip igual
 * evalúa el cuerpo para registrar los tests, por eso al saltar se devuelve una config vacía
 * (nunca se usa: hooks e its no corren).
 */
export function describeWithWompi(): { env: WompiTestEnv; describe: jest.Describe } {
  const env = loadWompiTestEnv();
  if (!env) {
    console.warn(
      `[test:int] Pruebas de Wompi SALTADAS: faltan ${VARIABLES.join(', ')} en Backend/.env.test.`,
    );
    return { env: { baseUrl: '', publicKey: '', privateKey: '', eventsSecret: '' }, describe: describe.skip };
  }
  return { env, describe };
}
