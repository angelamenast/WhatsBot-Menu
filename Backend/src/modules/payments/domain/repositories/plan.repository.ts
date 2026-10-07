import { Plan } from '../entities/plan.entity';

export interface PlanRepository {
  buscarPorId(id: string): Promise<Plan | null>;
  obtenerTodos(): Promise<Plan[]>;
}

export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');