import { jest } from '@jest/globals';
import { IniciarRenovacionUseCase } from './iniciar-renovacion.use-case';
import { IniciarRenovacionCommand } from '../dto/iniciar-renovacion.command';
import { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import type { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';
import { PlanVigenteConfirmarError, SinSuscripcionError } from '../../domain/errors/subscriptions.errors';
import { Suscripcion } from '../../../payments/domain/entities/suscripcion.entity';
import type { EstadoSuscripcion } from '../../../payments/domain/entities/suscripcion.entity';
import { Plan } from '../../../payments/domain/entities/plan.entity';
import type { TransaccionPagoRepository } from '../../../payments/domain/repositories/transaccion-pago.repository';
import type { PaymentGatewayPort } from '../../../payments/domain/repositories/application/ports/out/payment-gateway.port';
import { Negocio } from '../../../business/domain/entities/negocio.entity';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-10-01T15:00:00.000Z');
const PLAN = new Plan('plan-1', 'Pro', 49900.5, null, null);
const NEGOCIO = new Negocio('neg-1', 'user-1', 'Mi negocio', '3001234567', 'activo', null);
const REDIRECT = 'https://front.test/pago-confirmado';

const suscripcion = (estado: EstadoSuscripcion, diasParaVencer: number, plan: Plan | null = PLAN): SuscripcionVigente => ({
  suscripcion: new Suscripcion('sus-1', 'neg-1', 'plan-1', estado, null, new Date(AHORA.getTime() + diasParaVencer * DIA)),
  plan,
});

const command = (confirmar = false) => new IniciarRenovacionCommand('user-1', confirmar, REDIRECT);

describe('IniciarRenovacionUseCase', () => {
  let useCase: IniciarRenovacionUseCase;
  let consulta: jest.Mocked<SuscripcionConsultaRepository>;
  let negocios: jest.Mocked<NegocioRepository>;
  let transacciones: jest.Mocked<TransaccionPagoRepository>;
  let gateway: jest.Mocked<PaymentGatewayPort>;

  beforeEach(() => {
    consulta = { buscarVigentePorNegocio: jest.fn() };
    negocios = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn(),
      actualizar: jest.fn(),
    };
    transacciones = { crear: jest.fn(), buscarPorReferencia: jest.fn(), actualizarEstado: jest.fn() };
    gateway = { crearLinkPago: jest.fn(), verificarFirmaWebhook: jest.fn() };
    useCase = new IniciarRenovacionUseCase(consulta, negocios, transacciones, gateway);

    negocios.buscarPorUsuario.mockResolvedValue(NEGOCIO);
    gateway.crearLinkPago.mockResolvedValue({ id: 'link-1', url: 'https://checkout.wompi.co/l/link-1' });
  });

  it('lanza SinSuscripcionError si el usuario no tiene negocio', async () => {
    negocios.buscarPorUsuario.mockResolvedValue(null);

    await expect(useCase.execute(command(), AHORA)).rejects.toThrow(SinSuscripcionError);
    expect(gateway.crearLinkPago).not.toHaveBeenCalled();
  });

  it('lanza SinSuscripcionError si el negocio nunca tuvo plan', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(null);

    await expect(useCase.execute(command(), AHORA)).rejects.toThrow(SinSuscripcionError);
  });

  it('lanza SinSuscripcionError si la suscripción no tiene plan asociado', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -1, null));

    await expect(useCase.execute(command(), AHORA)).rejects.toThrow(SinSuscripcionError);
  });

  it('criterio 2: con más de 3 días de vigencia pide confirmación y no cobra', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 10));

    const error = await useCase.execute(command(false), AHORA).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlanVigenteConfirmarError);
    expect((error as PlanVigenteConfirmarError).fechaFin).toEqual(new Date(AHORA.getTime() + 10 * DIA));
    expect((error as PlanVigenteConfirmarError).message).toBe(
      'Tu plan aún está vigente hasta 2026-10-11. ¿Deseas renovarlo de todas formas?',
    );
    expect(gateway.crearLinkPago).not.toHaveBeenCalled();
    expect(transacciones.crear).not.toHaveBeenCalled();
  });

  it('criterio 2: con la confirmación renueva aunque el plan siga vigente', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 10));

    await expect(useCase.execute(command(true), AHORA)).resolves.toMatchObject({ moneda: 'COP' });
  });

  it('con el plan por vencer renueva sin pedir confirmación', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 2));

    await expect(useCase.execute(command(false), AHORA)).resolves.toBeDefined();
  });

  it('con el plan vencido renueva sin pedir confirmación', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -5));

    await expect(useCase.execute(command(false), AHORA)).resolves.toBeDefined();
  });

  it('genera el link con el precio del plan en centavos y registra el pago pendiente con el id del link como referencia', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -1));

    const result = await useCase.execute(command(), AHORA);

    const referencia = 'link-1';
    expect(gateway.crearLinkPago).toHaveBeenCalledWith({
      montoEnCentavos: 4990050,
      descripcion: 'Renovación Pro - WhatsBot Menu',
      redirectUrl: REDIRECT,
    });
    expect(transacciones.crear).toHaveBeenCalledWith({
      suscripcionId: 'sus-1',
      referenciaWompi: referencia,
      monto: 49900.5,
    });
    expect(result).toEqual({
      referencia,
      monto: 49900.5,
      moneda: 'COP',
      paymentUrl: 'https://checkout.wompi.co/l/link-1',
    });
  });

  it('no registra el pago si Wompi falla al generar el link', async () => {
    consulta.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -1));
    gateway.crearLinkPago.mockRejectedValue(new Error('Wompi no disponible'));

    await expect(useCase.execute(command(), AHORA)).rejects.toThrow('Wompi no disponible');
    expect(transacciones.crear).not.toHaveBeenCalled();
  });
});
