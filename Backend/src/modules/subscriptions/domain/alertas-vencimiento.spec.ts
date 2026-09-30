import {
  MENSAJE_ALERTA_VENCIDO,
  calcularVentanaAvisoPorVencer,
  mensajeAlertaPorVencer,
} from './alertas-vencimiento';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-10-01T13:00:00.000Z'); // 8:00 a. m. en Colombia

describe('calcularVentanaAvisoPorVencer', () => {
  it('cubre (ahora + 2 días, ahora + 3 días]', () => {
    const ventana = calcularVentanaAvisoPorVencer(AHORA);

    expect(ventana.desde).toEqual(new Date(AHORA.getTime() + 2 * DIA));
    expect(ventana.hasta).toEqual(new Date(AHORA.getTime() + 3 * DIA));
  });

  it('las ventanas de dos días consecutivos se encadenan sin huecos ni solapes', () => {
    const hoy = calcularVentanaAvisoPorVencer(AHORA);
    const manana = calcularVentanaAvisoPorVencer(new Date(AHORA.getTime() + DIA));

    expect(manana.desde).toEqual(hoy.hasta);
  });
});

describe('mensajes de alerta', () => {
  it('usa el texto de Jira para la alerta de por vencer', () => {
    expect(mensajeAlertaPorVencer(3)).toBe('Tu plan vence en 3 días. Renuévalo aquí.');
  });

  it('usa singular con un día', () => {
    expect(mensajeAlertaPorVencer(1)).toBe('Tu plan vence en 1 día. Renuévalo aquí.');
  });

  it('informa la restricción del servicio cuando el plan venció', () => {
    expect(MENSAJE_ALERTA_VENCIDO).toContain('restringido');
  });
});
