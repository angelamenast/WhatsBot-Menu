import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RESEND_API_URL, ResendCorreoAdapter } from './resend-correo.adapter';

const API_KEY = 're_clave_de_prueba';

const alerta = {
  destinatario: 'ricardo@unicauca.edu.co',
  nombreNegocio: 'Tienda QA',
  nombrePlan: 'Pro',
  fechaFin: new Date('2026-10-04T13:00:00.000Z'),
  diasRestantes: 3,
  mensaje: 'Tu plan vence en 3 días. Renuévalo aquí.',
};

function config(valores: Record<string, string | undefined>): ConfigService {
  return { get: (clave: string) => valores[clave] } as unknown as ConfigService;
}

const configCompleta = {
  RESEND_API_KEY: API_KEY,
  EMAIL_FROM: 'Tremia <onboarding@resend.dev>',
  FRONTEND_URL: 'https://front.test/',
};

function respuesta(status: number, cuerpo: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers });
}

describe('ResendCorreoAdapter', () => {
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock<typeof fetch>;
  let log: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it('envía la alerta a la API de Resend con remitente, destinatario, HTML y texto', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: 'email-1' }));

    await new ResendCorreoAdapter(config(configCompleta)).enviarAlertaPorVencer(alerta);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_API_URL);
    expect(opciones?.method).toBe('POST');
    expect(opciones?.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });

    const body = JSON.parse(opciones?.body as string);
    expect(body).toMatchObject({
      from: 'Tremia <onboarding@resend.dev>',
      to: ['ricardo@unicauca.edu.co'],
      subject: 'Tu plan está por vencer',
    });
    // FRONTEND_URL con "/" final no deja doble barra en el enlace.
    expect(body.text).toContain('https://front.test/billing');
    expect(body.html).toContain('https://front.test/billing');
  });

  it('la alerta de vencido usa el asunto de restricción', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: 'email-2' }));

    await new ResendCorreoAdapter(config(configCompleta)).enviarAlertaVencida(alerta);

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).subject).toBe('Tu plan venció');
  });

  it('sin FRONTEND_URL el enlace apunta al frontend local', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: 'email-3' }));

    await new ResendCorreoAdapter(config({ ...configCompleta, FRONTEND_URL: undefined })).enviarAlertaVencida(alerta);

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).text).toContain('http://localhost:4321/billing');
  });

  it('registra el envío sin exponer el correo completo ni la API key', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: 'email-1' }));

    await new ResendCorreoAdapter(config(configCompleta)).enviarAlertaPorVencer(alerta);

    const linea = log.mock.calls[0][0] as string;
    expect(linea).toContain('ri***@unicauca.edu.co');
    expect(linea).toContain('email-1');
    expect(linea).not.toContain('ricardo@');
    expect(linea).not.toContain(API_KEY);
  });

  it('lanza un error con el estado y el mensaje de Resend si la respuesta no es 2xx', async () => {
    fetchMock.mockResolvedValue(
      respuesta(403, { message: 'You can only send testing emails to your own email address' }),
    );

    await expect(new ResendCorreoAdapter(config(configCompleta)).enviarAlertaVencida(alerta)).rejects.toThrow(
      'Resend respondió 403: You can only send testing emails to your own email address',
    );
  });

  it('ante un 429 espera lo que indica Retry-After y reintenta una vez', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(429, { message: 'Too many requests' }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(respuesta(200, { id: 'email-4' }));
    const adapter = new ResendCorreoAdapter(config(configCompleta));
    const esperar = jest.fn((_ms: number) => Promise.resolve());
    adapter.esperar = esperar;

    await adapter.enviarAlertaPorVencer(alerta);

    expect(esperar).toHaveBeenCalledWith(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si el reintento también recibe 429, falla sin más intentos', async () => {
    fetchMock.mockResolvedValue(respuesta(429, { message: 'Too many requests' }));
    const adapter = new ResendCorreoAdapter(config(configCompleta));
    const esperar = jest.fn((_ms: number) => Promise.resolve());
    adapter.esperar = esperar;

    await expect(adapter.enviarAlertaPorVencer(alerta)).rejects.toThrow('Resend respondió 429');
    expect(esperar).toHaveBeenCalledWith(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('validarConfiguracion exige RESEND_API_KEY y EMAIL_FROM', () => {
    expect(() => new ResendCorreoAdapter(config({})).validarConfiguracion()).toThrow(
      'EMAIL_PROVIDER=resend requiere RESEND_API_KEY y EMAIL_FROM en el entorno.',
    );
    expect(() => new ResendCorreoAdapter(config(configCompleta)).validarConfiguracion()).not.toThrow();
  });

  it('no llama a Resend si falta la configuración', async () => {
    await expect(
      new ResendCorreoAdapter(config({ EMAIL_FROM: 'x@y.co' })).enviarAlertaVencida(alerta),
    ).rejects.toThrow('RESEND_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
