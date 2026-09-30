import { jest } from '@jest/globals';
import { ProcesarVencimientosUseCase } from './procesar-vencimientos.use-case';
import { VencimientosRepository } from '../../domain/repositories/vencimientos.repository';
import { SuscripcionPorNotificar } from '../../domain/entities/suscripcion-por-notificar.entity';
import type { CorreoPort } from '../ports/out/correo.port';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-10-01T13:00:00.000Z');

const suscripcion = (id: string, diasParaVencer: number, usuarioId = `user-${id}`) =>
  new SuscripcionPorNotificar(id, `neg-${id}`, usuarioId, `Negocio ${id}`, 'Pro', new Date(AHORA.getTime() + diasParaVencer * DIA));

describe('ProcesarVencimientosUseCase', () => {
  let useCase: ProcesarVencimientosUseCase;
  let repository: jest.Mocked<VencimientosRepository>;
  let correo: jest.Mocked<CorreoPort>;

  beforeEach(() => {
    repository = {
      marcarVencidas: jest.fn(),
      buscarActivasQueVencenEntre: jest.fn(),
      buscarCorreoDelDueno: jest.fn(),
    };
    correo = { enviarAlertaPorVencer: jest.fn(), enviarAlertaVencida: jest.fn() };
    useCase = new ProcesarVencimientosUseCase(repository, correo);

    repository.marcarVencidas.mockResolvedValue([]);
    repository.buscarActivasQueVencenEntre.mockResolvedValue([]);
    repository.buscarCorreoDelDueno.mockImplementation(async (usuarioId) => `${usuarioId}@correo.test`);
  });

  it('criterio 3: marca las vencidas y notifica la restricción a cada dueño', async () => {
    const vencida = suscripcion('a', -0.1);
    repository.marcarVencidas.mockResolvedValue([vencida]);

    const resumen = await useCase.execute(AHORA);

    expect(repository.marcarVencidas).toHaveBeenCalledWith(AHORA);
    expect(correo.enviarAlertaVencida).toHaveBeenCalledWith({
      destinatario: 'user-a@correo.test',
      nombreNegocio: 'Negocio a',
      nombrePlan: 'Pro',
      fechaFin: vencida.fechaFin,
      mensaje: 'Tu plan venció y el servicio está restringido. Renuévalo para reactivarlo.',
    });
    expect(resumen).toMatchObject({ marcadasVencidas: 1, alertasVencidoEnviadas: 1, fallidas: [] });
  });

  it('criterio 1: busca los planes que vencen en la ventana (ahora + 2 días, ahora + 3 días] y los alerta', async () => {
    repository.buscarActivasQueVencenEntre.mockResolvedValue([suscripcion('b', 2.5)]);

    const resumen = await useCase.execute(AHORA);

    expect(repository.buscarActivasQueVencenEntre).toHaveBeenCalledWith(
      new Date(AHORA.getTime() + 2 * DIA),
      new Date(AHORA.getTime() + 3 * DIA),
    );
    expect(correo.enviarAlertaPorVencer).toHaveBeenCalledWith(
      expect.objectContaining({
        destinatario: 'user-b@correo.test',
        diasRestantes: 3,
        mensaje: 'Tu plan vence en 3 días. Renuévalo aquí.',
      }),
    );
    expect(resumen.alertasPorVencerEnviadas).toBe(1);
  });

  it('criterio 2: si no hay planes en la ventana (p. ej. ya se renovaron) no envía nada', async () => {
    const resumen = await useCase.execute(AHORA);

    expect(correo.enviarAlertaPorVencer).not.toHaveBeenCalled();
    expect(correo.enviarAlertaVencida).not.toHaveBeenCalled();
    expect(resumen).toEqual({ marcadasVencidas: 0, alertasVencidoEnviadas: 0, alertasPorVencerEnviadas: 0, fallidas: [] });
  });

  it('solo notifica las vencidas que esta ejecución cambió: una segunda corrida no duplica correos', async () => {
    repository.marcarVencidas.mockResolvedValueOnce([suscripcion('a', -0.1)]).mockResolvedValueOnce([]);

    await useCase.execute(AHORA);
    const segunda = await useCase.execute(AHORA);

    expect(correo.enviarAlertaVencida).toHaveBeenCalledTimes(1);
    expect(segunda.marcadasVencidas).toBe(0);
  });

  it('si un correo falla registra la falla y sigue con los demás', async () => {
    repository.buscarActivasQueVencenEntre.mockResolvedValue([suscripcion('b', 2.5), suscripcion('c', 2.2)]);
    correo.enviarAlertaPorVencer.mockRejectedValueOnce(new Error('proveedor caído'));

    const resumen = await useCase.execute(AHORA);

    expect(correo.enviarAlertaPorVencer).toHaveBeenCalledTimes(2);
    expect(resumen.alertasPorVencerEnviadas).toBe(1);
    expect(resumen.fallidas).toEqual([{ suscripcionId: 'b', tipo: 'POR_VENCER', motivo: 'proveedor caído' }]);
  });

  it('si el dueño no tiene correo lo registra como fallida sin intentar enviar', async () => {
    repository.marcarVencidas.mockResolvedValue([suscripcion('a', -0.1)]);
    repository.buscarCorreoDelDueno.mockResolvedValue(null);

    const resumen = await useCase.execute(AHORA);

    expect(correo.enviarAlertaVencida).not.toHaveBeenCalled();
    expect(resumen.fallidas).toEqual([
      { suscripcionId: 'a', tipo: 'VENCIDO', motivo: 'El dueño no tiene correo registrado' },
    ]);
  });

  it('si falla la búsqueda del correo en Auth también se registra y sigue', async () => {
    repository.marcarVencidas.mockResolvedValue([suscripcion('a', -0.1), suscripcion('d', -0.2)]);
    repository.buscarCorreoDelDueno.mockRejectedValueOnce(new Error('User not found'));

    const resumen = await useCase.execute(AHORA);

    expect(correo.enviarAlertaVencida).toHaveBeenCalledTimes(1);
    expect(resumen).toMatchObject({ marcadasVencidas: 2, alertasVencidoEnviadas: 1 });
    expect(resumen.fallidas[0]).toMatchObject({ suscripcionId: 'a', motivo: 'User not found' });
  });

  it('propaga el error si no se puede actualizar la BD (el job lo captura)', async () => {
    repository.marcarVencidas.mockRejectedValue(new Error('db caída'));

    await expect(useCase.execute(AHORA)).rejects.toThrow('db caída');
    expect(correo.enviarAlertaVencida).not.toHaveBeenCalled();
  });
});
