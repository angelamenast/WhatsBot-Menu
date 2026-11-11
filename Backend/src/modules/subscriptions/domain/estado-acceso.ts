import type { Suscripcion } from '../../payments/domain/entities/suscripcion.entity';

export type EstadoAcceso = 'ACTIVO' | 'POR_VENCER' | 'VENCIDO' | 'SIN_PLAN';

// RF-37 / HU-8.4: se alerta cuando faltan 3 días o menos.
export const DIAS_AVISO_VENCIMIENTO = 3;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Fuente única del estado de acceso: se calcula desde fecha_fin en cada consulta,
// así la restricción aplica aunque el job de vencimientos (HU-8.4) aún no haya corrido.
export function calcularEstadoAcceso(
  suscripcion: Pick<Suscripcion, 'estado' | 'fechaFin'> | null,
  ahora: Date,
): EstadoAcceso {
  if (!suscripcion) {
    return 'SIN_PLAN';
  }

  if (suscripcion.estado === 'vencida') {
    return 'VENCIDO';
  }

  if (suscripcion.estado !== 'activa') {
    return 'SIN_PLAN';
  }

  // Una suscripción activa sin fecha_fin no permite probar su vigencia: falla cerrado.
  if (!suscripcion.fechaFin) {
    return 'VENCIDO';
  }

  const restanteMs = suscripcion.fechaFin.getTime() - ahora.getTime();

  if (restanteMs <= 0) {
    return 'VENCIDO';
  }

  if (restanteMs <= DIAS_AVISO_VENCIMIENTO * MS_POR_DIA) {
    return 'POR_VENCER';
  }

  return 'ACTIVO';
}

export function calcularDiasRestantes(fechaFin: Date | null, ahora: Date): number | null {
  if (!fechaFin) {
    return null;
  }

  return Math.max(0, Math.ceil((fechaFin.getTime() - ahora.getTime()) / MS_POR_DIA));
}

// RF-25 / RNF-02: el agente solo responde con un plan vigente.
export function puedeUsarAgente(estado: EstadoAcceso): boolean {
  return estado === 'ACTIVO' || estado === 'POR_VENCER';
}

// HU-8.5 criterio 2: con el plan vencido el dashboard queda en solo lectura.
// SIN_PLAN no se restringe para no bloquear el onboarding (registro → negocio → plan).
export function puedeEditar(estado: EstadoAcceso): boolean {
  return estado !== 'VENCIDO';
}
