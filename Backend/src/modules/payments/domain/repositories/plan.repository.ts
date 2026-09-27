import { Plan } from '../entities/plan.entity';

export interface PlanRepository {
  buscarPorId(id: string): Promise<Plan | null>;
}

export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');