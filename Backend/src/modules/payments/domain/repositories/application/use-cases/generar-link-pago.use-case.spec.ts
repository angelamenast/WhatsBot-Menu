import { jest } from '@jest/globals';
import { GenerarLinkPagoUseCase } from './generar-link-pago.use-case';
import { GenerarLinkPagoCommand } from '../dto/generar-link-pago.command';
import { PlanNoEncontradoError } from '../../../errors/payments.errors';
import { Plan } from '../../../entities/plan.entity';
import { Suscripcion } from '../../../entities/suscripcion.entity';

describe('GenerarLinkPagoUseCase', () => {
  let useCase: GenerarLinkPagoUseCase;
  let planRepository: any;
  let suscripcionRepository: any;
  let transaccionRepository: any;
  let paymentGateway: any;

  beforeEach(() => {
    planRepository = { buscarPorId: jest.fn() };
    suscripcionRepository = { crear: jest.fn(), buscarPorId: jest.fn(), actualizarEstado: jest.fn() };
    transaccionRepository = { crear: jest.fn(), buscarPorReferencia: jest.fn(), actualizarEstado: jest.fn() };
    paymentGateway = { crearLinkPago: jest.fn(), verificarFirmaWebhook: jest.fn() };

    useCase = new GenerarLinkPagoUseCase(
      planRepository,
      suscripcionRepository,
      transaccionRepository,
      paymentGateway,
    );
  });

  it('genera el link de pago cuando el plan existe', async () => {
    planRepository.buscarPorId.mockResolvedValue(new Plan('plan-1', 'Pro', 50000, 1000, 100000));
    suscripcionRepository.crear.mockResolvedValue(
      new Suscripcion('sub-1', 'negocio-1', 'plan-1', 'pendiente', null, null),
    );
    paymentGateway.crearLinkPago.mockResolvedValue({ id: 'link-1', url: 'https://checkout.wompi.co/l/link-1' });

    const result = await useCase.execute(new GenerarLinkPagoCommand('negocio-1', 'plan-1'));

    expect(result.paymentUrl).toBe('https://checkout.wompi.co/l/link-1');
    expect(transaccionRepository.crear).toHaveBeenCalled();
  });

  it('lanza PlanNoEncontradoError si el plan no existe', async () => {
    planRepository.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute(new GenerarLinkPagoCommand('negocio-1', 'plan-inexistente')),
    ).rejects.toThrow(PlanNoEncontradoError);

    expect(suscripcionRepository.crear).not.toHaveBeenCalled();
  });
});