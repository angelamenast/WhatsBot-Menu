import { Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ProcesarVencimientosUseCase } from '../../../application/use-cases/procesar-vencimientos.use-case';
import type { ResumenVencimientos } from '../../../application/use-cases/procesar-vencimientos.use-case';
import { JobsSecretGuard } from '../guards/jobs-secret.guard';

// HU-8.4 en Render gratuito: el servicio se duerme y el @Cron interno no es confiable, así
// que un cron externo (cron-job.org, GitHub Actions…) llama este endpoint una vez al día.
// En ese entorno se pone VENCIMIENTOS_JOB_ENABLED=false para no ejecutar el proceso dos veces.
// Se deja bajo el ThrottlerGuard global: una llamada diaria no se acerca al límite.
@Controller('subscriptions/jobs')
@UseGuards(JobsSecretGuard)
export class SubscriptionsJobsController {
  private readonly logger = new Logger(SubscriptionsJobsController.name);

  constructor(private readonly procesarVencimientosUseCase: ProcesarVencimientosUseCase) {}

  @Post('vencimientos')
  @HttpCode(HttpStatus.OK)
  async procesarVencimientos(): Promise<ResumenVencimientos> {
    const resumen = await this.procesarVencimientosUseCase.execute();

    this.logger.log(
      `Vencimientos (cron externo): ${resumen.marcadasVencidas} marcadas como vencidas, ` +
        `${resumen.alertasVencidoEnviadas} alertas de restricción y ` +
        `${resumen.alertasPorVencerEnviadas} alertas de por vencer enviadas, ` +
        `${resumen.fallidas.length} fallidas`,
    );

    return resumen;
  }
}
