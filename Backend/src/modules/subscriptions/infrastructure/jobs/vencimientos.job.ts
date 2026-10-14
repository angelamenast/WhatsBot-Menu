import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ProcesarVencimientosUseCase } from '../../application/use-cases/procesar-vencimientos.use-case';

// Todos los días a las 8:00 a. m. hora de Colombia. La ventana de aviso de 24 h
// (domain/alertas-vencimiento.ts) supone exactamente una ejecución diaria.
export const HORARIO_JOB_VENCIMIENTOS = '0 8 * * *';
export const ZONA_HORARIA_JOB = 'America/Bogota';

@Injectable()
export class VencimientosJob {
  private readonly logger = new Logger(VencimientosJob.name);

  constructor(
    private readonly procesarVencimientosUseCase: ProcesarVencimientosUseCase,
    private readonly configService: ConfigService,
  ) {}

  // waitForCompletion evita que una ejecución arranque si la anterior no ha terminado.
  // Los errores se capturan aquí: un fallo del job nunca debe tumbar el proceso del backend.
  @Cron(HORARIO_JOB_VENCIMIENTOS, {
    name: 'vencimientos-suscripciones',
    timeZone: ZONA_HORARIA_JOB,
    waitForCompletion: true,
  })
  async ejecutar(): Promise<void> {
    if (this.configService.get<string>('VENCIMIENTOS_JOB_ENABLED') === 'false') {
      this.logger.log('Job de vencimientos deshabilitado (VENCIMIENTOS_JOB_ENABLED=false)');
      return;
    }

    try {
      const resumen = await this.procesarVencimientosUseCase.execute();

      this.logger.log(
        `Vencimientos procesados: ${resumen.marcadasVencidas} marcadas como vencidas, ` +
          `${resumen.alertasVencidoEnviadas} alertas de restricción y ` +
          `${resumen.alertasPorVencerEnviadas} alertas de por vencer enviadas, ` +
          `${resumen.fallidas.length} fallidas`,
      );
      for (const fallida of resumen.fallidas) {
        this.logger.warn(`No se notificó ${fallida.tipo} a la suscripción ${fallida.suscripcionId}: ${fallida.motivo}`);
      }
    } catch (error) {
      this.logger.error(`El job de vencimientos falló: ${(error as Error).message}`, (error as Error).stack);
    }
  }
}
