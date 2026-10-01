import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PlanActivoGuard } from './plan-activo.guard';
import { ObtenerEstadoSuscripcionUseCase } from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import { SuscripcionConsultaRepository } from '../../../domain/repositories/suscripcion-consulta.repository';
import type { SuscripcionVigente } from '../../../domain/entities/suscripcion-vigente.entity';
import { Suscripcion } from '../../../../payments/domain/entities/suscripcion.entity';
import type { EstadoSuscripcion } from '../../../../payments/domain/entities/suscripcion.entity';
import { Negocio } from '../../../../business/domain/entities/negocio.entity';
import type { NegocioRepository } from '../../../../business/domain/repositories/negocio.repository';

const DIA = 24 * 60 * 60 * 1000;
const NEGOCIO = new Negocio('neg-1', 'user-1', 'Mi negocio', '3001234567', 'activo', null);

const suscripcion = (estado: EstadoSuscripcion, diasParaVencer: number): SuscripcionVigente => ({
  suscripcion: new Suscripcion('sus-1', 'neg-1', 'plan-1', estado, null, new Date(Date.now() + diasParaVencer * DIA)),
  plan: null,
});

const contexto = (method: string, user: { id: string } | null = { id: 'user-1' }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, user: user ?? undefined }) }),
  }) as unknown as ExecutionContext;

// HU-8.5 criterio 2: con el plan vencido se puede consultar, pero no editar.
describe('PlanActivoGuard', () => {
  let guard: PlanActivoGuard;
  let repository: jest.Mocked<SuscripcionConsultaRepository>;
  let negocioRepository: jest.Mocked<NegocioRepository>;

  beforeEach(() => {
    repository = {
      buscarVigentePorNegocio: jest.fn(),
    };
    negocioRepository = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn(),
      actualizar: jest.fn(),
    };
    negocioRepository.buscarPorUsuario.mockResolvedValue(NEGOCIO);
    guard = new PlanActivoGuard(new ObtenerEstadoSuscripcionUseCase(repository, negocioRepository));
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('bloquea %s con el plan vencido (403 PLAN_VENCIDO)', async (method) => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -1));

    const error = await guard.canActivate(contexto(method)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Tu plan venció. Renueva para editar.',
      codigo: 'PLAN_VENCIDO',
    });
  });

  it('bloquea si fecha_fin pasó aunque el job no haya marcado la suscripción', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', -1));

    await expect(guard.canActivate(contexto('PATCH'))).rejects.toThrow(ForbiddenException);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('permite %s con el plan vencido sin consultar la BD', async (method) => {
    await expect(guard.canActivate(contexto(method))).resolves.toBe(true);
    expect(repository.buscarVigentePorNegocio).not.toHaveBeenCalled();
  });

  it('permite escribir con el plan activo', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 10));

    await expect(guard.canActivate(contexto('PATCH'))).resolves.toBe(true);
    expect(negocioRepository.buscarPorUsuario).toHaveBeenCalledWith('user-1');
  });

  it('permite escribir con el plan por vencer', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 2));

    await expect(guard.canActivate(contexto('POST'))).resolves.toBe(true);
  });

  it('no bloquea SIN_PLAN para no romper el onboarding', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(null);

    await expect(guard.canActivate(contexto('POST'))).resolves.toBe(true);
  });

  it('no bloquea a un usuario que aún no tiene negocio', async () => {
    negocioRepository.buscarPorUsuario.mockResolvedValue(null);

    await expect(guard.canActivate(contexto('POST'))).resolves.toBe(true);
  });

  it('responde 401 si se usa sin SupabaseAuthGuard antes', async () => {
    await expect(guard.canActivate(contexto('PATCH', null))).rejects.toThrow(UnauthorizedException);
  });
});
