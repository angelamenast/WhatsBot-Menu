import { jest } from '@jest/globals';
import { SubscriptionPlanStatusAdapter } from './subscription-plan-status.adapter';
import { ObtenerEstadoSuscripcionUseCase } from '../../application/use-cases/obtener-estado-suscripcion.use-case';
import { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';
import type { EstadoSuscripcion } from '../../domain/entities/suscripcion-vigente.entity';

const DIA = 24 * 60 * 60 * 1000;

const suscripcion = (estado: EstadoSuscripcion, diasParaVencer: number) =>
  new SuscripcionVigente('sus-1', 'neg-1', estado, new Date(Date.now() + diasParaVencer * DIA), null);

// HU-8.5 criterio 1: el webhook de WhatsApp registra el mensaje y consulta isActive();
// con false no despacha al Agente IA.
describe('SubscriptionPlanStatusAdapter', () => {
  let adapter: SubscriptionPlanStatusAdapter;
  let repository: jest.Mocked<SuscripcionConsultaRepository>;

  beforeEach(() => {
    repository = {
      buscarNegocioIdPorUsuario: jest.fn(),
      buscarVigentePorNegocio: jest.fn(),
    };
    adapter = new SubscriptionPlanStatusAdapter(new ObtenerEstadoSuscripcionUseCase(repository));
  });

  it('consulta la suscripción del negocio destinatario', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 10));

    await adapter.isActive('neg-1');

    expect(repository.buscarVigentePorNegocio).toHaveBeenCalledWith('neg-1');
    expect(repository.buscarNegocioIdPorUsuario).not.toHaveBeenCalled();
  });

  it('devuelve false con el plan vencido', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -1));

    await expect(adapter.isActive('neg-1')).resolves.toBe(false);
  });

  it('devuelve false si fecha_fin pasó aunque el job no haya marcado la suscripción', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', -1));

    await expect(adapter.isActive('neg-1')).resolves.toBe(false);
  });

  it('devuelve false si el negocio nunca compró un plan', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(null);

    await expect(adapter.isActive('neg-1')).resolves.toBe(false);
  });

  it('devuelve true con el plan activo', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 10));

    await expect(adapter.isActive('neg-1')).resolves.toBe(true);
  });

  it('devuelve true con el plan por vencer', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 2));

    await expect(adapter.isActive('neg-1')).resolves.toBe(true);
  });
});
