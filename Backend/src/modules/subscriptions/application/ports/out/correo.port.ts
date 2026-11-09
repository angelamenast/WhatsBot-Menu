export interface AlertaVencimientoCorreo {
  destinatario: string;
  nombreNegocio: string;
  nombrePlan: string;
  fechaFin: Date;
  mensaje: string;
}

export interface AlertaPorVencerCorreo extends AlertaVencimientoCorreo {
  diasRestantes: number;
}

// Puerto de salida para las notificaciones por correo de HU-8.4. El proveedor concreto
// se elige con EMAIL_PROVIDER: "log" (solo registra) o "resend" (envío real).
export interface CorreoPort {
  enviarAlertaPorVencer(alerta: AlertaPorVencerCorreo): Promise<void>;
  enviarAlertaVencida(alerta: AlertaVencimientoCorreo): Promise<void>;
}

export const CORREO_PORT = Symbol('CORREO_PORT');
