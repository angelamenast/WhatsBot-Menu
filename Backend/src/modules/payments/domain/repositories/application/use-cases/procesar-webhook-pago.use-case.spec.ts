import { jest } from '@jest/globals';
import { ProcesarWebhookPagoUseCase } from './procesar-webhook-pago.use-case';
import { ProcesarWebhookPagoCommand } from '../dto/procesar-webhook-pago.command';
import { SuscripcionNoEncontradaError, TransaccionNoEncontradaError } from '../../../errors/payments.errors';
import { TransaccionPago } from '../../../entities/transaccion-pago.entity';
import type { EstadoTransaccion } from '../../../entities/transaccion-pago.entity';
import { Suscripcion } from '../../../entities/suscripcion.entity';
import type { EstadoSuscripcion } from '../../../entities/suscripcion.entity';
import type { TransaccionPagoRepository } from '../../transaccion-pago.repository';
import type { SuscripcionRepository } from '../../suscripcion.repository';

const DIA = 24 * 60 * 60 * 1000;
// 2-oct-2026 10:00 a. m. en Colombia.
const AHORA = new Date('2026-10-02T15:00:00.000Z');
const INICIO = new Date('2026-09-12T15:00:00.000Z');

const transaccion = (estado: EstadoTransaccion) => new TransaccionPago('tx-1', 'sus-1', 'test_AbC123', 50000, estado);
const suscripcion = (estado: EstadoSuscripcion, fechaFin: Date | null) =>
  new Suscripcion('sus-1', 'neg-1', 'plan-1', estado, INICIO, fechaFin);
const command = (estado: ProcesarWebhookPagoCommand['estadoTransaccion']) => new ProcesarWebhookPagoCommand('test_AbC123', estado);

describe('ProcesarWebhookPagoUseCase', () => {
  let useCase: ProcesarWebhookPagoUseCase;
  let transacciones: jest.Mocked<TransaccionPagoRepository>;
  let suscripciones: jest.Mocked<SuscripcionRepository>;

  beforeEach(() => {
    transacciones = { crear: jest.fn(), buscarPorReferencia: jest.fn(), actualizarEstado: jest.fn() };
    suscripciones = { crear: jest.fn(), buscarPorId: jest.fn(), actualizarEstado: jest.fn() };
    useCase = new ProcesarWebhookPagoUseCase(transacciones, suscripciones);
  });

  it('busca la transacción por la referencia recibida (id del link de pago)', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('pendiente', null));

    await useCase.execute(command('APPROVED'), AHORA);

    expect(transacciones.buscarPorReferencia).toHaveBeenCalledWith('test_AbC123');
  });

  it('lanza TransaccionNoEncontradaError si la referencia no existe', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(null);

    await expect(useCase.execute(command('APPROVED'), AHORA)).rejects.toThrow(TransaccionNoEncontradaError);
  });

  it('compra nueva aprobada: activa la suscripción por un mes desde hoy', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('pendiente', AHORA));

    await useCase.execute(command('APPROVED'), AHORA);

    expect(suscripciones.actualizarEstado).toHaveBeenCalledWith('sus-1', 'activa', {
      fechaInicio: AHORA,
      fechaFin: new Date('2026-11-02T15:00:00.000Z'),
    });
    expect(transacciones.actualizarEstado).toHaveBeenCalledWith('tx-1', 'aprobado');
  });

  it('renovación anticipada aprobada: suma el mes desde fecha_fin sin perder días y conserva fecha_inicio', async () => {
    const fechaFin = new Date(AHORA.getTime() + 20 * DIA); // 22-oct
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('activa', fechaFin));

    await useCase.execute(command('APPROVED'), AHORA);

    expect(suscripciones.actualizarEstado).toHaveBeenCalledWith('sus-1', 'activa', {
      fechaInicio: INICIO,
      fechaFin: new Date('2026-11-22T15:00:00.000Z'),
    });
  });

  it('renovación de un plan vencido: suma el mes desde hoy', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('vencida', new Date(AHORA.getTime() - 5 * DIA)));

    await useCase.execute(command('APPROVED'), AHORA);

    expect(suscripciones.actualizarEstado).toHaveBeenCalledWith('sus-1', 'activa', {
      fechaInicio: INICIO,
      fechaFin: new Date('2026-11-02T15:00:00.000Z'),
    });
  });

  it('extiende la vigencia antes de marcar el pago como aprobado', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('activa', AHORA));
    suscripciones.actualizarEstado.mockRejectedValue(new Error('db caída'));

    await expect(useCase.execute(command('APPROVED'), AHORA)).rejects.toThrow('db caída');
    expect(transacciones.actualizarEstado).not.toHaveBeenCalled();
  });

  it.each(['DECLINED', 'VOIDED', 'ERROR'] as const)('pago %s: marca la transacción rechazada sin tocar la suscripción', async (estado) => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));

    await useCase.execute(command(estado), AHORA);

    expect(transacciones.actualizarEstado).toHaveBeenCalledWith('tx-1', 'rechazado');
    expect(suscripciones.actualizarEstado).not.toHaveBeenCalled();
  });

  it('un pago aprobado después de un intento rechazado sí activa la suscripción', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('rechazado'));
    suscripciones.buscarPorId.mockResolvedValue(suscripcion('pendiente', null));

    await useCase.execute(command('APPROVED'), AHORA);

    expect(suscripciones.actualizarEstado).toHaveBeenCalledWith('sus-1', 'activa', expect.anything());
    expect(transacciones.actualizarEstado).toHaveBeenCalledWith('tx-1', 'aprobado');
  });

  it('ignora los avisos repetidos de un pago ya aprobado (no extiende dos veces)', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('aprobado'));

    await useCase.execute(command('APPROVED'), AHORA);
    await useCase.execute(command('DECLINED'), AHORA);

    expect(suscripciones.actualizarEstado).not.toHaveBeenCalled();
    expect(transacciones.actualizarEstado).not.toHaveBeenCalled();
  });

  it('ignora estados no finales como PENDING', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));

    await useCase.execute(new ProcesarWebhookPagoCommand('test_AbC123', 'PENDING' as never), AHORA);

    expect(transacciones.actualizarEstado).not.toHaveBeenCalled();
  });

  it('lanza SuscripcionNoEncontradaError si la suscripción del pago no existe', async () => {
    transacciones.buscarPorReferencia.mockResolvedValue(transaccion('pendiente'));
    suscripciones.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute(command('APPROVED'), AHORA)).rejects.toThrow(SuscripcionNoEncontradaError);
    expect(transacciones.actualizarEstado).not.toHaveBeenCalled();
  });
});
