import {
  ASUNTO_POR_VENCER,
  ASUNTO_VENCIDO,
  escaparHtml,
  formatearFechaLarga,
  plantillaPorVencer,
  plantillaVencida,
} from './plantillas-correo';

const URL_RENOVAR = 'https://front.test/billing';

const alertaBase = {
  destinatario: 'dueno@negocio.test',
  nombreNegocio: 'Tienda QA',
  nombrePlan: 'Pro',
  // 4 de octubre a las 8:00 a. m. en Colombia.
  fechaFin: new Date('2026-10-04T13:00:00.000Z'),
};

describe('plantillas de correo de HU-8.4', () => {
  it('plan por vencer: asunto, mensaje del dashboard, fecha en Colombia y enlace de renovación', () => {
    const correo = plantillaPorVencer(
      { ...alertaBase, diasRestantes: 3, mensaje: 'Tu plan vence en 3 días. Renuévalo aquí.' },
      URL_RENOVAR,
    );

    expect(correo.asunto).toBe(ASUNTO_POR_VENCER);
    for (const cuerpo of [correo.texto, correo.html]) {
      expect(cuerpo).toContain('Tienda QA');
      expect(cuerpo).toContain('Pro');
      expect(cuerpo).toContain('Tu plan vence en 3 días. Renuévalo aquí.');
      expect(cuerpo).toContain('4 de octubre de 2026');
      expect(cuerpo).toContain(URL_RENOVAR);
    }
  });

  it('plan por vencer muestra el tiempo restante en singular o plural', () => {
    const tres = plantillaPorVencer({ ...alertaBase, diasRestantes: 3, mensaje: 'm' }, URL_RENOVAR);
    const uno = plantillaPorVencer({ ...alertaBase, diasRestantes: 1, mensaje: 'm' }, URL_RENOVAR);

    expect(tres.html).toContain('Tu plan vence en 3 días');
    expect(uno.html).toContain('Tu plan vence en 1 día');
    expect(uno.texto).toContain('Tiempo restante: 1 día');
  });

  it('plan vencido usa su propio asunto e indica el servicio restringido', () => {
    const correo = plantillaVencida({ ...alertaBase, mensaje: 'Tu plan venció.' }, URL_RENOVAR);

    expect(correo.asunto).toBe(ASUNTO_VENCIDO);
    expect(correo.texto).toContain('Tu plan venció.');
    expect(correo.html).toContain('Servicio restringido');
    expect(correo.html).toContain('Reactivar mi plan');
  });

  it('lleva la marca Tremia', () => {
    const correo = plantillaVencida({ ...alertaBase, mensaje: 'm' }, URL_RENOVAR);

    expect(correo.html).toContain('Tremia');
    expect(correo.texto).toContain('El equipo de Tremia');
    expect(correo.html).not.toContain('WhatsBot');
  });

  it('escapa el HTML que escribe el usuario en el nombre del negocio', () => {
    const correo = plantillaVencida(
      { ...alertaBase, nombreNegocio: '<script>alert("x")</script> & Cía', mensaje: 'Tu plan venció.' },
      URL_RENOVAR,
    );

    expect(correo.html).not.toContain('<script>');
    expect(correo.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cía');
    // El texto plano no se interpreta como HTML: va sin escapar.
    expect(correo.texto).toContain('<script>alert("x")</script> & Cía');
  });

  it('escaparHtml cubre los cinco caracteres especiales', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('la fecha se muestra en hora de Colombia aunque en UTC ya sea el día siguiente', () => {
    // 3 de octubre a las 10:00 p. m. en Colombia = 4 de octubre 03:00 UTC.
    expect(formatearFechaLarga(new Date('2026-10-04T03:00:00.000Z'))).toBe('3 de octubre de 2026');
  });
});
