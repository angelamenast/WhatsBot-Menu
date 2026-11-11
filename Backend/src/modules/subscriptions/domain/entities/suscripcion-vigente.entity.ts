import type { Suscripcion } from '../../../payments/domain/entities/suscripcion.entity';
import type { Plan } from '../../../payments/domain/entities/plan.entity';

// Suscripción que determina el acceso de un negocio, junto con su plan. Reutiliza las entidades
// del módulo payments, dueño de las tablas suscripciones y planes; este módulo solo las lee.
export interface SuscripcionVigente {
  suscripcion: Suscripcion;
  plan: Plan | null;
}
