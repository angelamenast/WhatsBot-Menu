import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { SubscriptionsJobsController } from './subscriptions-jobs.controller';
import { ProcesarVencimientosUseCase } from '../../../application/use-cases/procesar-vencimientos.use-case';
import type { ResumenVencimientos } from '../../../application/use-cases/procesar-vencimientos.use-case';

describe('SubscriptionsJobsController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ejecuta el proceso de vencimientos y devuelve el resumen', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const resumen: ResumenVencimientos = {
      marcadasVencidas: 1,
      alertasVencidoEnviadas: 1,
      alertasPorVencerEnviadas: 2,
      fallidas: [],
    };
    const execute = jest.fn<ProcesarVencimientosUseCase['execute']>().mockResolvedValue(resumen);
    const controller = new SubscriptionsJobsController({ execute } as unknown as ProcesarVencimientosUseCase);

    await expect(controller.procesarVencimientos()).resolves.toEqual(resumen);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
