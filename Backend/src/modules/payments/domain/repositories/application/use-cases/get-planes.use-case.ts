import { Inject, Injectable } from '@nestjs/common';
import type { PlanRepository } from '../../plan.repository';
import { PLAN_REPOSITORY } from '../../plan.repository';
import { Plan } from '../../../entities/plan.entity';

@Injectable()
export class GetPlanesUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepository: PlanRepository,
  ) {}

  async execute(): Promise<Plan[]> {
    return this.planRepository.obtenerTodos();
  }
}
