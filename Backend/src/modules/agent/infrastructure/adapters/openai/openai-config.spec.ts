import {
  DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_TIMEOUT_MS,
  OpenAiConfigError,
  readOpenAiConfig,
} from './openai-config';

const envOf = (values: Record<string, string | undefined>) => (key: string) => values[key];

const BASE = { OPENAI_API_KEY: 'clave-de-prueba-no-real', OPENAI_MODEL: 'modelo-de-prueba' };

describe('readOpenAiConfig', () => {
  it('con solo clave y modelo aplica los defaults y no define temperatura', () => {
    const config = readOpenAiConfig(envOf(BASE));

    expect(config).toEqual({
      apiKey: 'clave-de-prueba-no-real',
      model: 'modelo-de-prueba',
      timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS,
      maxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
      temperature: undefined,
    });
    expect(DEFAULT_OPENAI_TIMEOUT_MS).toBe(10000);
    expect(DEFAULT_OPENAI_MAX_OUTPUT_TOKENS).toBe(500);
  });

  it('lee los valores configurados (incluida la temperatura 0)', () => {
    const config = readOpenAiConfig(
      envOf({ ...BASE, OPENAI_TIMEOUT_MS: '8000', OPENAI_MAX_OUTPUT_TOKENS: '300', OPENAI_TEMPERATURE: '0' }),
    );

    expect(config.timeoutMs).toBe(8000);
    expect(config.maxOutputTokens).toBe(300);
    expect(config.temperature).toBe(0);
  });

  it('un valor vacío se trata como no configurado (así viene en .env.example)', () => {
    const config = readOpenAiConfig(envOf({ ...BASE, OPENAI_TIMEOUT_MS: '', OPENAI_TEMPERATURE: '  ' }));

    expect(config.timeoutMs).toBe(DEFAULT_OPENAI_TIMEOUT_MS);
    expect(config.temperature).toBeUndefined();
  });

  it.each([
    ['OPENAI_API_KEY', { OPENAI_MODEL: 'modelo' }],
    ['OPENAI_API_KEY', { OPENAI_API_KEY: '   ', OPENAI_MODEL: 'modelo' }],
    ['OPENAI_MODEL', { OPENAI_API_KEY: 'clave' }],
    ['OPENAI_MODEL', { OPENAI_API_KEY: 'clave', OPENAI_MODEL: '' }],
  ])('falta %s: lanza OpenAiConfigError nombrando la variable', (variable, values) => {
    let error: unknown;
    try {
      readOpenAiConfig(envOf(values));
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(OpenAiConfigError);
    expect((error as OpenAiConfigError).variable).toBe(variable);
  });

  it.each([
    ['OPENAI_TIMEOUT_MS', 'abc'],
    ['OPENAI_TIMEOUT_MS', '0'],
    ['OPENAI_TIMEOUT_MS', '-5'],
    ['OPENAI_TIMEOUT_MS', '1.5'],
    ['OPENAI_MAX_OUTPUT_TOKENS', 'mucho'],
    ['OPENAI_MAX_OUTPUT_TOKENS', '0'],
    ['OPENAI_TEMPERATURE', 'caliente'],
    ['OPENAI_TEMPERATURE', '3'],
    ['OPENAI_TEMPERATURE', '-1'],
  ])('%s=%s es inválida: lanza OpenAiConfigError', (variable, value) => {
    expect(() => readOpenAiConfig(envOf({ ...BASE, [variable]: value }))).toThrow(OpenAiConfigError);
  });

  it('los errores nunca contienen la clave ni el valor recibido', () => {
    const secret = 'sk-esto-es-secreto';
    let message = '';
    try {
      readOpenAiConfig(envOf({ OPENAI_API_KEY: secret, OPENAI_MODEL: 'modelo', OPENAI_TIMEOUT_MS: 'abc' }));
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain('OPENAI_TIMEOUT_MS');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('abc');
  });
});
