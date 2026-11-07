import {
  DEFAULT_GEMINI_MAX_OUTPUT_TOKENS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_THINKING_LEVEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  GeminiConfigError,
  readGeminiConfig,
} from './gemini-config';

const envOf = (values: Record<string, string | undefined>) => (key: string) => values[key];

describe('readGeminiConfig', () => {
  it('con solo la clave aplica los defaults', () => {
    const config = readGeminiConfig(envOf({ GEMINI_API_KEY: 'clave-de-prueba' }));

    expect(config).toEqual({
      apiKey: 'clave-de-prueba',
      model: DEFAULT_GEMINI_MODEL,
      timeoutMs: DEFAULT_GEMINI_TIMEOUT_MS,
      maxOutputTokens: DEFAULT_GEMINI_MAX_OUTPUT_TOKENS,
      thinkingLevel: DEFAULT_GEMINI_THINKING_LEVEL,
    });
    expect(DEFAULT_GEMINI_THINKING_LEVEL).toBe('low');
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(DEFAULT_GEMINI_TIMEOUT_MS).toBe(5000);
    expect(config.fallbackModel).toBeUndefined();
  });

  it('GEMINI_FALLBACK_MODEL es opcional: se lee recortado, y vacío significa sin respaldo', () => {
    expect(readGeminiConfig(envOf({ GEMINI_API_KEY: 'k', GEMINI_FALLBACK_MODEL: ' gemini-3.1-flash-lite ' })).fallbackModel).toBe(
      'gemini-3.1-flash-lite',
    );
    expect(readGeminiConfig(envOf({ GEMINI_API_KEY: 'k', GEMINI_FALLBACK_MODEL: '' })).fallbackModel).toBeUndefined();
    expect(readGeminiConfig(envOf({ GEMINI_API_KEY: 'k' })).fallbackModel).toBeUndefined();
  });

  it('lee el modelo, el timeout, los tokens y el nivel de razonamiento configurados', () => {
    const config = readGeminiConfig(
      envOf({
        GEMINI_API_KEY: 'k',
        GEMINI_MODEL: ' otro-modelo ',
        GEMINI_TIMEOUT_MS: '8000',
        GEMINI_MAX_OUTPUT_TOKENS: '2048',
        GEMINI_THINKING_LEVEL: 'MINIMAL',
      }),
    );

    expect(config).toMatchObject({ model: 'otro-modelo', timeoutMs: 8000, maxOutputTokens: 2048, thinkingLevel: 'minimal' });
  });

  it('un valor vacío se trata como no configurado (así viene en .env.example)', () => {
    const config = readGeminiConfig(
      envOf({ GEMINI_API_KEY: 'k', GEMINI_MODEL: '', GEMINI_TIMEOUT_MS: '', GEMINI_THINKING_LEVEL: '  ' }),
    );

    expect(config.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(config.timeoutMs).toBe(DEFAULT_GEMINI_TIMEOUT_MS);
    expect(config.thinkingLevel).toBe('low');
  });

  it.each(['AQ.Ab8RN6-clave-nueva', 'AIzaSyEjemplo', 'cualquier cosa rara 123'])(
    'la clave NO se valida por formato: "%s" se acepta tal cual',
    (apiKey) => {
      expect(readGeminiConfig(envOf({ GEMINI_API_KEY: apiKey })).apiKey).toBe(apiKey);
    },
  );

  it.each([undefined, '', '   '])('sin clave (%j): falla nombrando la variable', (apiKey) => {
    let error: unknown;
    try {
      readGeminiConfig(envOf({ GEMINI_API_KEY: apiKey }));
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(GeminiConfigError);
    expect((error as GeminiConfigError).variable).toBe('GEMINI_API_KEY');
  });

  it.each([
    ['GEMINI_TIMEOUT_MS', 'abc'],
    ['GEMINI_TIMEOUT_MS', '0'],
    ['GEMINI_TIMEOUT_MS', '-1'],
    ['GEMINI_TIMEOUT_MS', '1.5'],
    ['GEMINI_MAX_OUTPUT_TOKENS', 'mucho'],
    ['GEMINI_MAX_OUTPUT_TOKENS', '0'],
    ['GEMINI_THINKING_LEVEL', 'extremo'],
  ])('%s=%s es inválida: lanza GeminiConfigError', (variable, value) => {
    expect(() => readGeminiConfig(envOf({ GEMINI_API_KEY: 'k', [variable]: value }))).toThrow(GeminiConfigError);
  });

  it('los errores nunca contienen la clave ni el valor recibido', () => {
    const secret = 'AQ.esto-es-secreto';
    let message = '';
    try {
      readGeminiConfig(envOf({ GEMINI_API_KEY: secret, GEMINI_TIMEOUT_MS: 'valor-raro' }));
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain('GEMINI_TIMEOUT_MS');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('valor-raro');
  });
});
