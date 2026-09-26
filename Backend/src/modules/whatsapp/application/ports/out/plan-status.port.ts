export interface PlanStatusPort {
  isActive(businessId: string): Promise<boolean>;
}

export const PLAN_STATUS_PORT = Symbol('PlanStatusPort');
