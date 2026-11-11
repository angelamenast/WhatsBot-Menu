/**
 * Puerto de cuota de tokens del plan (RNF-08). Solo tokens (entrada + salida); no aplica
 * `limite_mensajes`. Un mensaje puede sobrepasar el tope: el consumo no se conoce de antemano.
 */
export interface UsageQuotaPort {
  /**
   * true si el negocio puede seguir consumiendo tokens en el periodo actual. false si no tiene
   * suscripción vigente o ya alcanzó `planes.limite_tokens` (null = ilimitado).
   */
  hasQuota(businessId: string): Promise<boolean>;
}

export const USAGE_QUOTA_PORT = Symbol('UsageQuotaPort');
