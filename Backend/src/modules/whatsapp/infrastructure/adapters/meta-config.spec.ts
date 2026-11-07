import { ConfigService } from '@nestjs/config';
import { loadMetaConfig } from './meta-config';

describe('loadMetaConfig', () => {
  const build = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
      getOrThrow: (key: string) => {
        const value = env[key];
        if (value === undefined) throw new Error(`falta ${key}`);
        return value;
      },
    }) as unknown as ConfigService;

  const complete = {
    WHATSAPP_ACCESS_TOKEN: 'token-secreto',
    WHATSAPP_APP_SECRET: 'app-secret',
    WHATSAPP_VERIFY_TOKEN: 'verify-token',
  };

  it('configuración completa: usa v25.0 por defecto', () => {
    expect(loadMetaConfig(build(complete))).toEqual({
      apiVersion: 'v25.0',
      accessToken: 'token-secreto',
      appSecret: 'app-secret',
      verifyToken: 'verify-token',
    });
  });

  it('respeta WHATSAPP_API_VERSION', () => {
    expect(loadMetaConfig(build({ ...complete, WHATSAPP_API_VERSION: 'v24.0' })).apiVersion).toBe('v24.0');
  });

  it('WHATSAPP_API_VERSION vacía usa el valor por defecto', () => {
    expect(loadMetaConfig(build({ ...complete, WHATSAPP_API_VERSION: '  ' })).apiVersion).toBe('v25.0');
  });

  it.each(['25.0', 'v25', 'v25.0/../x', 'latest'])('WHATSAPP_API_VERSION inválida "%s": falla', (version) => {
    expect(() => loadMetaConfig(build({ ...complete, WHATSAPP_API_VERSION: version }))).toThrow(
      /WHATSAPP_API_VERSION/,
    );
  });

  it('sin token de acceso: falla nombrando la variable y sin filtrar los otros valores', () => {
    const { WHATSAPP_ACCESS_TOKEN: _omitted, ...rest } = complete;

    expect(() => loadMetaConfig(build(rest))).toThrow(/WHATSAPP_ACCESS_TOKEN/);
    expect(() => loadMetaConfig(build(rest))).not.toThrow(/app-secret|verify-token/);
  });

  it('lista todas las variables que faltan, también las vacías', () => {
    expect(() => loadMetaConfig(build({ WHATSAPP_ACCESS_TOKEN: '   ' }))).toThrow(
      'WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN',
    );
  });
});
