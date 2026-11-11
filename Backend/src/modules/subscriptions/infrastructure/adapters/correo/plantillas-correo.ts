import type { AlertaPorVencerCorreo, AlertaVencimientoCorreo } from '../../../application/ports/out/correo.port';

export interface CorreoRenderizado {
  asunto: string;
  html: string;
  texto: string;
}

export const NOMBRE_MARCA = 'Tremia';
export const ASUNTO_POR_VENCER = 'Tu plan está por vencer';
export const ASUNTO_VENCIDO = 'Tu plan venció';

// Paleta del frontend (frontend/src/styles/global.css y clases Tailwind de los componentes
// de facturación), para que el correo se vea como la plataforma.
const COLOR = {
  marca: '#f97316', // primary / orange-500 (logo)
  accion: '#ea580c', // secondary / orange-600: botón y enlaces (mejor contraste con texto blanco)
  fondo: '#fff8f5', // background
  superficie: '#ffffff',
  superficieSuave: '#faf5f0', // surface-container-low
  borde: '#e4e4e7', // zinc-200
  divisor: '#f3eae4', // border-technical
  titulo: '#18181b', // zinc-900
  cuerpo: '#52525b', // zinc-600
  etiqueta: '#71717a', // zinc-500
  pie: '#a1a1aa', // zinc-400
} as const;

const FUENTE = `font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;`;

const formatoFechaLarga = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeZone: 'America/Bogota',
});

// "4 de octubre de 2026", en hora de Colombia.
export function formatearFechaLarga(fecha: Date): string {
  return formatoFechaLarga.format(fecha);
}

// El nombre del negocio y del plan los escribe el usuario: se escapan antes de ir al HTML.
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Variante {
  asunto: string;
  etiqueta: string;
  titulo: string;
  // Colores de estado: fondo y texto de la etiqueta, franja superior y borde del detalle.
  acentoFondo: string;
  acentoTexto: string;
  acentoBorde: string;
  textoBoton: string;
  // Filas adicionales del bloque de detalle según el tipo de alerta.
  filasExtra: [string, string][];
  // Texto oculto que los clientes de correo muestran como vista previa en la bandeja.
  vistaPrevia: string;
}

export function plantillaPorVencer(alerta: AlertaPorVencerCorreo, urlRenovar: string): CorreoRenderizado {
  const dias = alerta.diasRestantes === 1 ? '1 día' : `${alerta.diasRestantes} días`;
  return renderizar(alerta, urlRenovar, {
    asunto: ASUNTO_POR_VENCER,
    etiqueta: 'Por vencer',
    titulo: `Tu plan vence en ${dias}`,
    acentoFondo: '#fef3c7',
    acentoTexto: '#92400e',
    acentoBorde: '#f59e0b',
    textoBoton: 'Renovar mi plan',
    filasExtra: [['Tiempo restante', dias]],
    vistaPrevia: `Renueva antes del ${formatearFechaLarga(alerta.fechaFin)} para que tu agente siga atendiendo.`,
  });
}

export function plantillaVencida(alerta: AlertaVencimientoCorreo, urlRenovar: string): CorreoRenderizado {
  return renderizar(alerta, urlRenovar, {
    asunto: ASUNTO_VENCIDO,
    etiqueta: 'Plan vencido',
    titulo: 'Tu plan venció',
    acentoFondo: '#fee2e2',
    acentoTexto: '#991b1b',
    acentoBorde: '#ef4444',
    textoBoton: 'Reactivar mi plan',
    filasExtra: [['Estado', 'Servicio restringido']],
    vistaPrevia: 'Tu servicio está restringido. Renueva para reactivar tu agente.',
  });
}

// El mensaje es el mismo texto que muestra el dashboard (domain/alertas-vencimiento.ts).
// HTML con tablas y estilos en línea: es lo único que respetan Gmail, Outlook y los
// clientes móviles por igual.
function renderizar(alerta: AlertaVencimientoCorreo, urlRenovar: string, v: Variante): CorreoRenderizado {
  const fecha = formatearFechaLarga(alerta.fechaFin);
  const anio = new Date().getFullYear();

  const filas: [string, string][] = [
    ['Negocio', alerta.nombreNegocio],
    ['Plan', alerta.nombrePlan],
    ['Fecha de vencimiento', fecha],
    ...v.filasExtra,
  ];

  const texto = [
    `${v.titulo}`,
    '',
    `Hola, ${alerta.nombreNegocio}:`,
    '',
    alerta.mensaje,
    '',
    ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    '',
    `${v.textoBoton}: ${urlRenovar}`,
    '',
    `— El equipo de ${NOMBRE_MARCA}`,
  ].join('\n');

  const filasHtml = filas
    .map(
      ([etiqueta, valor], i) => `
                    <tr>
                      <td style="padding:12px 0;${i > 0 ? `border-top:1px solid ${COLOR.divisor};` : ''}font-size:14px;color:${COLOR.etiqueta};">${escaparHtml(etiqueta)}</td>
                      <td align="right" style="padding:12px 0;${i > 0 ? `border-top:1px solid ${COLOR.divisor};` : ''}font-size:14px;color:${COLOR.titulo};font-weight:700;">${escaparHtml(valor)}</td>
                    </tr>`,
    )
    .join('');

  const url = escaparHtml(urlRenovar);

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escaparHtml(v.asunto)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.fondo};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escaparHtml(v.vistaPrevia)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.fondo};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;${FUENTE}">
            <!-- Marca (mismo logo del frontend: cuadro naranja + nombre en naranja) -->
            <tr>
              <td style="padding:0 4px 20px;">
                <span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:12px;background-color:${COLOR.marca};color:#ffffff;font-size:18px;font-weight:800;text-align:center;vertical-align:middle;">T</span>
                <span style="font-size:24px;font-weight:800;color:${COLOR.marca};vertical-align:middle;padding-left:10px;letter-spacing:-0.4px;">${NOMBRE_MARCA}</span>
              </td>
            </tr>
            <!-- Tarjeta -->
            <tr>
              <td style="background-color:${COLOR.superficie};border-radius:16px;border:1px solid ${COLOR.borde};overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="height:4px;background-color:${v.acentoBorde};font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr>
                    <td style="padding:32px 32px 8px;">
                      <span style="display:block;margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:${COLOR.accion};">Tu suscripción</span>
                      <span style="display:inline-block;padding:4px 12px;border-radius:999px;background-color:${v.acentoFondo};color:${v.acentoTexto};font-size:11px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;"><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background-color:${v.acentoBorde};vertical-align:middle;margin-right:6px;"></span>${escaparHtml(v.etiqueta)}</span>
                      <h1 style="margin:14px 0 0;font-size:26px;line-height:34px;color:${COLOR.titulo};font-weight:800;letter-spacing:-0.4px;">${escaparHtml(v.titulo)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px 0;font-size:15px;line-height:24px;color:${COLOR.cuerpo};">
                      <p style="margin:0 0 12px;">Hola, <strong style="color:${COLOR.titulo};">${escaparHtml(alerta.nombreNegocio)}</strong>:</p>
                      <p style="margin:0;">${escaparHtml(alerta.mensaje)}</p>
                    </td>
                  </tr>
                  <!-- Detalle del plan -->
                  <tr>
                    <td style="padding:24px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.superficieSuave};border-radius:12px;border-left:4px solid ${v.acentoBorde};">
                        <tr>
                          <td style="padding:8px 20px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filasHtml}
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Botón -->
                  <tr>
                    <td align="center" style="padding:32px 32px 8px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="border-radius:12px;background-color:${COLOR.accion};">
                            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escaparHtml(v.textoBoton)}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px 32px;font-size:13px;line-height:20px;color:${COLOR.etiqueta};text-align:center;">
                      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                      <a href="${url}" target="_blank" style="color:${COLOR.accion};font-weight:600;word-break:break-all;">${url}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Pie -->
            <tr>
              <td style="padding:24px 16px 0;font-size:12px;line-height:18px;color:${COLOR.pie};text-align:center;">
                Recibes este correo porque tu negocio tiene una suscripción en ${NOMBRE_MARCA}.<br>
                Es un mensaje automático; por favor no respondas a este correo.<br>
                © ${anio} <span style="color:${COLOR.marca};font-weight:700;">${NOMBRE_MARCA}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { asunto: v.asunto, html, texto };
}
