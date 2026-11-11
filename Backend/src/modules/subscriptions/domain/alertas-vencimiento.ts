import { DIAS_AVISO_VENCIMIENTO } from './estado-acceso';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type TipoAlerta = 'POR_VENCER' | 'VENCIDO';

// Textos compartidos por el dashboard (GET /status) y los correos de HU-8.4,
// para que el usuario lea exactamente el mismo mensaje en ambos canales.
export function mensajeAlertaPorVencer(diasRestantes: number): string {
  const dias = diasRestantes === 1 ? '1 día' : `${diasRestantes} días`;
  return `Tu plan vence en ${dias}. Renuévalo aquí.`;
}

export const MENSAJE_ALERTA_VENCIDO =
  'Tu plan venció y el servicio está restringido. Renuévalo para reactivarlo.';

export interface VentanaAviso {
  desde: Date;
  hasta: Date;
}

// HU-8.4 criterio 1: se alerta cuando faltan 3 días o menos.
// El job corre una vez al día, así que la ventana cubre exactamente 24 h:
// (ahora + 2 días, ahora + 3 días]. Con ejecuciones diarias consecutivas las ventanas
// se encadenan sin huecos ni solapes y cada suscripción cae en una sola, sin necesidad
// de registrar las alertas enviadas. Criterio 2: si el plan se renovó, su fecha_fin ya
// no cae en la ventana y no se alerta.
export function calcularVentanaAvisoPorVencer(ahora: Date): VentanaAviso {
  return {
    desde: new Date(ahora.getTime() + (DIAS_AVISO_VENCIMIENTO - 1) * MS_POR_DIA),
    hasta: new Date(ahora.getTime() + DIAS_AVISO_VENCIMIENTO * MS_POR_DIA),
  };
}
