import 'reflect-metadata';
import { jest } from '@jest/globals';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AgentConfigController } from './agent-config.controller';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { PlanActivoGuard } from '../../../subscriptions/infrastructure/presentation/guards/plan-activo.guard';
import { ObtenerEstadoSuscripcionUseCase } from '../../../subscriptions/application/use-cases/obtener-estado-suscripcion.use-case';
import { GetAgentConfigUseCase } from '../../application/use-cases/get-agent-config.use-case';
import { UpdateAgentConfigUseCase } from '../../application/use-cases/update-agent-config.use-case';
import { AgentConfig } from '../../domain/entities/agent-config.entity';

type AnyFn = (...args: any[]) => any;

describe('AgentConfigController', () => {
  let app: INestApplication<App>;
  let getAgentConfigUseCase: { execute: jest.Mock<AnyFn> };
  let updateAgentConfigUseCase: { execute: jest.Mock<AnyFn> };
  let estadoSuscripcion: { execute: jest.Mock<AnyFn> };

  const guardsOf = (target: object): unknown[] =>
    Reflect.getMetadata('__guards__', target) ?? [];

  beforeEach(async () => {
    getAgentConfigUseCase = {
      execute: jest.fn<AnyFn>().mockResolvedValue(AgentConfig.default('business-1')),
    };
    updateAgentConfigUseCase = {
      execute: jest.fn<AnyFn>().mockResolvedValue(AgentConfig.default('business-1')),
    };
    // PlanActivoGuard real; solo se simula el estado de la suscripción que consulta.
    estadoSuscripcion = {
      execute: jest.fn<AnyFn>().mockResolvedValue({ puedeEditar: true }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AgentConfigController],
      providers: [
        { provide: GetAgentConfigUseCase, useValue: getAgentConfigUseCase },
        { provide: UpdateAgentConfigUseCase, useValue: updateAgentConfigUseCase },
        {
          provide: BusinessService,
          useValue: {
            findByUsuario: jest.fn<AnyFn>().mockResolvedValue({ id: 'business-1' }),
          },
        },
        { provide: ObtenerEstadoSuscripcionUseCase, useValue: estadoSuscripcion },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('la clase lleva SupabaseAuthGuard y solo PATCH (update) lleva PlanActivoGuard, a nivel de método', () => {
    expect(guardsOf(AgentConfigController)).toContain(SupabaseAuthGuard);
    expect(guardsOf(AgentConfigController)).not.toContain(PlanActivoGuard);
    expect(guardsOf(AgentConfigController.prototype.update)).toContain(PlanActivoGuard);
    expect(guardsOf(AgentConfigController.prototype.get)).not.toContain(PlanActivoGuard);
  });

  it('PATCH /agent/config con plan VENCIDO → 403 PLAN_VENCIDO y no se actualiza nada', async () => {
    estadoSuscripcion.execute.mockResolvedValue({ puedeEditar: false });

    const response = await request(app.getHttpServer())
      .patch('/agent/config')
      .send({ tone: 'formal' })
      .expect(403);

    expect(response.body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Tu plan venció. Renueva para editar.',
      codigo: 'PLAN_VENCIDO',
    });
    expect(updateAgentConfigUseCase.execute).not.toHaveBeenCalled();
  });

  it('PATCH /agent/config con plan que permite editar → 200 y se actualiza', async () => {
    await request(app.getHttpServer())
      .patch('/agent/config')
      .send({ tone: 'formal' })
      .expect(200);

    expect(updateAgentConfigUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('GET /agent/config con plan VENCIDO sigue funcionando sin consultar la suscripción', async () => {
    estadoSuscripcion.execute.mockResolvedValue({ puedeEditar: false });

    await request(app.getHttpServer()).get('/agent/config').expect(200);

    expect(estadoSuscripcion.execute).not.toHaveBeenCalled();
  });
});
