import { jest } from '@jest/globals';
import { GenerarLinkPagoUseCase } from './generar-link-pago.use-case';
import { GenerarLinkPagoCommand } from '../dto/generar-link-pago.command';
import { PlanNoEncontradoError } from '../../../errors/payments.errors';
import { Plan } from '../../../entities/plan.entity';
import { Suscripcion } from '../../../entities/suscripcion.entity';

const REDIRECT = 'https://front.test/pago-confirmado';

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

    const result = await useCase.execute(new GenerarLinkPagoCommand('negocio-1', 'plan-1', REDIRECT));

    expect(result.paymentUrl).toBe('https://checkout.wompi.co/l/link-1');
    expect(paymentGateway.crearLinkPago).toHaveBeenCalledWith({
      montoEnCentavos: 5000000,
      descripcion: 'Suscripción Pro - WhatsBot Menu',
      redirectUrl: REDIRECT,
    });
  });

  it('guarda el id del link como referencia, que es lo que Wompi envía en el webhook', async () => {
    planRepository.buscarPorId.mockResolvedValue(new Plan('plan-1', 'Pro', 50000, 1000, 100000));
    suscripcionRepository.crear.mockResolvedValue(
      new Suscripcion('sub-1', 'negocio-1', 'plan-1', 'pendiente', null, null),
    );
    paymentGateway.crearLinkPago.mockResolvedValue({ id: 'test_AbC123', url: 'https://checkout.wompi.co/l/test_AbC123' });

    await useCase.execute(new GenerarLinkPagoCommand('negocio-1', 'plan-1', REDIRECT));

    expect(transaccionRepository.crear).toHaveBeenCalledWith({
      suscripcionId: 'sub-1',
      referenciaWompi: 'test_AbC123',
      monto: 50000,
    });
  });

  it('lanza PlanNoEncontradoError si el plan no existe', async () => {
    planRepository.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute(new GenerarLinkPagoCommand('negocio-1', 'plan-inexistente', REDIRECT)),
    ).rejects.toThrow(PlanNoEncontradoError);

    expect(suscripcionRepository.crear).not.toHaveBeenCalled();
  });
});