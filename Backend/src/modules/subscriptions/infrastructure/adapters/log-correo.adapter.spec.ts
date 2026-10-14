import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { LogCorreoAdapter, enmascararCorreo } from './log-correo.adapter';

describe('enmascararCorreo', () => {
  it('oculta la parte local y conserva el dominio', () => {
    expect(enmascararCorreo('ricardo@unicauca.edu.co')).toBe('ri***@unicauca.edu.co');
  });

  it('devuelve *** si el valor no es un correo', () => {
    expect(enmascararCorreo('sin-arroba')).toBe('***');
  });
});

describe('LogCorreoAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registra la alerta sin exponer el correo completo', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new LogCorreoAdapter().enviarAlertaPorVencer({
      destinatario: 'ricardo@unicauca.edu.co',
      nombreNegocio: 'Tienda QA',
      nombrePlan: 'Pro',
      fechaFin: new Date('2026-10-04T13:00:00.000Z'),
      diasRestantes: 3,
      mensaje: 'Tu plan vence en 3 días. Renuévalo aquí.',
    });

    const linea = log.mock.calls[0][0] as string;
    expect(linea).toContain('ri***@unicauca.edu.co');
    expect(linea).not.toContain('ricardo@');
    expect(linea).toContain('Vence: 2026-10-04');
    expect(linea).toContain('Tu plan vence en 3 días. Renuévalo aquí.');
  });
});
