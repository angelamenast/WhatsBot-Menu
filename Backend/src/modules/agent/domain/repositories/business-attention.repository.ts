export interface BusinessAttentionStatus {
  /** Nombre comercial del negocio (`nombre_negocio`). */
  businessName: string;
  /** El dueño activó la atención automática (el agente puede responder). */
  autoAttentionActive: boolean;
  /** El negocio está operativo: estado 'activo' y no eliminado. */
  businessActive: boolean;
}

/**
 * Puerto de solo lectura sobre el estado de atención del negocio. El dominio del negocio
 * le pertenece al módulo `business`; agent solo consulta estos dos flags con UNA query (flags y nombre).
 * Lanza BusinessNotFoundError si el negocio no existe.
 */
export interface BusinessAttentionRepository {
  getStatus(businessId: string): Promise<BusinessAttentionStatus>;
}

export const BUSINESS_ATTENTION_REPOSITORY = Symbol('BusinessAttentionRepository');
