import { jest } from '@jest/globals';
import { ConsultarRenovacionUseCase } from './consultar-renovacion.use-case';
import { ConsultarRenovacionCommand } from '../dto/consultar-renovacion.command';
import { RenovacionNoEncontradaError } from '../../domain/errors/subscriptions.errors';
import { TransaccionPago } from '../../../payments/domain/entities/transaccion-pago.entity';
import type { EstadoTransaccion } from '../../../payments/domain/entities/transaccion-pago.entity';
import { Suscripcion } from '../../../payments/domain/entities/suscripcion.entity';
import type { TransaccionPagoRepository } from '../../../payments/domain/repositories/transaccion-pago.repository';
import type { SuscripcionRepository } from '../../../payments/domain/repositories/suscripcion.repository';
import { Negocio } from '../../../business/domain/entities/negocio.entity';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';

const FECHA_FIN = new Date('2026-11-20T15:00:00.000Z');
const NEGOCIO = new Negocio('neg-1', 'user-1', 'Mi negocio', '3001234567', 'activo', null);
const transaccion = (estado: EstadoTransaccion) => new TransaccionPago('tx-1', 'sus-1', 'test_AbC123', 50000, estado);
const suscripcion = (negocioId = 'neg-1') =>
  new Suscripcion('sus-1', negocioId, 'plan-1', 'activa', new Date('2026-09-20T15:00:00.000Z'), FECHA_FIN);
const command = new ConsultarRenovacionCommand('user-1', 'test_AbC123');

describe('ConsultarRenovacionUseCase', () => {
  let useCase: ConsultarRenovacionUseCase;
  let negocios: jest.Mocked<NegocioRepository>;
  let transacciones: jest.Mocked<TransaccionPagoRepository>;
  let suscripciones: jest.Mocked<SuscripcionRepository>;

  beforeEach(() => {
    negocios = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn(),
      actualizar: jest.fn(),
    };
    transacciones = { crear: jest.fn(), buscarPorReferencia: jest.fn(), actualizarEstado: jest.fn() };
    suscripciones = { crear: jest.fn(), buscarPorId: jest.fn(), actualizarEstado: jest.fn() };
    useCase = new ConsultarRenovacionUseCase(negocios, transacciones, suscripciones);

    negocios.buscarPorUsuario.mockResolvedValue(NEGOCIO);
    suscripciones.buscarPorId.mockResolvedValue(suscripcion());
  });

  it('pago aprobado: informa la nueva fecha de vencimiento', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('aprobado'));

    await expect(useCase.execute(command)).resolves.toEqual({
      referencia: 'test_AbC123',
      estado: 'APROBADO',
      fechaFin: FECHA_FIN,
      mensaje: 'Plan renovado correctamente.',
    });
    expect(suscripciones.buscarPorId).toHaveBeenCalledWith('sus-1');
  });

  it('criterio 3: pago rechazado no informa fecha y devuelve el mensaje de error', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('rechazado'));

    await expect(useCase.execute(command)).resolves.toEqual({
      referencia: 'test_AbC123',
      estado: 'RECHAZADO',
      fechaFin: null,
      mensaje: 'No pudimos procesar la renovación. Intenta nuevamente.',
    });
  });

  it('pago pendiente no informa fecha todavía', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));

    await expect(useCase.execute(command)).resolves.toMatchObject({ estado: 'PENDIENTE', fechaFin: null });
  });

  it('lanza RenovacionNoEncontradaError si la referencia no existe', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(RenovacionNoEncontradaError);
    expect(suscripciones.buscarPorId).not.toHaveBeenCalled();
  });

  it('lanza RenovacionNoEncontradaError si la referencia es de otro negocio', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('aprobado'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('neg-ajeno'));

    await expect(useCase.execute(command)).rejects.toThrow(RenovacionNoEncontradaError);
  });

  it('lanza RenovacionNoEncontradaError si el usuario no tiene negocio', async () => {
    negocios.buscarPorUsuario.mockResolvedValue(null);
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('aprobado'));

    await expect(useCase.execute(command)).rejects.toThrow(RenovacionNoEncontradaError);
  });
});
