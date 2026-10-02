import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VencimientosJob } from './vencimientos.job';
import { ProcesarVencimientosUseCase } from '../../application/use-cases/procesar-vencimientos.use-case';

describe('VencimientosJob', () => {
  let job: VencimientosJob;
  let procesarVencimientos: jest.Mocked<ProcesarVencimientosUseCase>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    procesarVencimientos = { execute: jest.fn() } as any;
    configService = { get: jest.fn() } as any;
    job = new VencimientosJob(procesarVencimientos, configService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ejecuta el procesamiento de vencimientos y registra el resumen', async () => {
    procesarVencimientos.execute.mockResolvedValue({
      marcadasVencidas: 1,
      alertasVencidoEnviadas: 1,
      alertasPorVencerEnviadas: 2,
      fallidas: [{ suscripcionId: 's-1', tipo: 'POR_VENCER', motivo: 'proveedor caído' }],
    });

    await job.ejecutar();

    expect(procesarVencimientos.execute).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('s-1'));
  });

  it('nunca propaga un error: un fallo del job no debe tumbar el backend', async () => {
    procesarVencimientos.execute.mockRejectedValue(new Error('db caída'));

    await expect(job.ejecutar()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('db caída'),
      expect.anything(),
    );
  });

  it('no hace nada si VENCIMIENTOS_JOB_ENABLED=false', async () => {
    configService.get.mockReturnValue('false');

    await job.ejecutar();

    expect(procesarVencimientos.execute).not.toHaveBeenCalled();
  });
});
