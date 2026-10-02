// Duración de un periodo de suscripción. La tabla planes aún no tiene periodicidad
// (pendiente con el PO); mientras tanto todos los planes son mensuales, igual que en
// el webhook de pagos de HU-8.1.
export const DURACION_PLAN_MESES = 1;

// Colombia es UTC-5 sin horario de verano: el desfase es fijo.
const DESFASE_COLOMBIA_MS = -5 * 60 * 60 * 1000;

// Suma meses respetando el calendario de Colombia y el fin de mes:
// 31-ene + 1 mes = 28-feb (o 29 en bisiesto), no 3-mar como haría Date#setMonth.
export function sumarMeses(fecha: Date, meses: number): Date {
  const local = new Date(fecha.getTime() + DESFASE_COLOMBIA_MS);
  const dia = local.getUTCDate();

  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + meses);

  const ultimoDiaDelMes = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(dia, ultimoDiaDelMes));

  return new Date(local.getTime() - DESFASE_COLOMBIA_MS);
}

// HU-8.3 criterio 1: renovar extiende la vigencia sin perder días.
// - Plan vigente: el periodo se suma a la fecha_fin actual.
// - Plan vencido (o sin fecha): el periodo se cuenta desde ahora.
export function calcularNuevaFechaFin(
  fechaFinActual: Date | null,
  ahora: Date,
  meses: number = DURACION_PLAN_MESES,
): Date {
  const base = fechaFinActual && fechaFinActual.getTime() > ahora.getTime() ? fechaFinActual : ahora;

  return sumarMeses(base, meses);
}

// Fecha en formato AAAA-MM-DD según el calendario de Colombia, para mensajes al usuario.
export function formatearFechaColombia(fecha: Date): string {
  return new Date(fecha.getTime() + DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
}
