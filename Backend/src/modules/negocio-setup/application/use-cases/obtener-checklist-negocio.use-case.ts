import { Inject, Injectable } from '@nestjs/common';
import type { NegocioRepository } from '../../../business/domain/repositories/negocio.repository';
import { NEGOCIO_REPOSITORY } from '../../../business/domain/repositories/negocio.repository';
import type { ProductRepository } from '../../../business/domain/repositories/product.repository';
import { PRODUCT_REPOSITORY } from '../../../business/domain/repositories/product.repository';
import { NegocioNoEncontradoError } from '../../../business/domain/errors/business.errors';
import type { WhatsappConnectionRepository } from '../../../whatsapp/domain/repositories/whatsapp-connection.repository';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../../whatsapp/domain/repositories/whatsapp-connection.repository';
import { WhatsappConnectionStatus } from '../../../whatsapp/domain/entities/whatsapp-connection.entity';
import type { AgentConfigRepository } from '../../../agent/domain/repositories/agent-config.repository';
import { AGENT_CONFIG_REPOSITORY } from '../../../agent/domain/repositories/agent-config.repository';
import { ObtenerEstadoSuscripcionUseCase } from '../../../subscriptions/application/use-cases/obtener-estado-suscripcion.use-case';
import { ObtenerEstadoSuscripcionCommand } from '../../../subscriptions/application/dto/obtener-estado-suscripcion.command';
import { construirChecklist } from '../../domain/checklist-negocio';
import type { ChecklistNegocio } from '../../domain/checklist-negocio';
import { ObtenerChecklistNegocioCommand } from '../dto/obtener-checklist-negocio.command';

// TREMIA-104. Cada paso se lee con el repositorio o caso de uso que ya es dueño de ese dato.
@Injectable()
export class ObtenerChecklistNegocioUseCase {
  constructor(
    @Inject(NEGOCIO_REPOSITORY) private readonly negocioRepository: NegocioRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: ProductRepository,
    @Inject(WHATSAPP_CONNECTION_REPOSITORY) private readonly whatsappConnectionRepository: WhatsappConnectionRepository,
    @Inject(AGENT_CONFIG_REPOSITORY) private readonly agentConfigRepository: AgentConfigRepository,
    private readonly obtenerEstadoSuscripcionUseCase: ObtenerEstadoSuscripcionUseCase,
  ) {}

  async execute(command: ObtenerChecklistNegocioCommand): Promise<ChecklistNegocio> {
    const negocio = await this.negocioRepository.buscarPorUsuario(command.usuarioId);
    if (!negocio) {
      throw new NegocioNoEncontradoError();
    }
    return this.evaluar(negocio.id);
  }

  // Público para que CambiarAtencionAutomaticaUseCase evalúe un negocio ya resuelto.
  async evaluar(negocioId: string): Promise<ChecklistNegocio> {
    const [suscripcion, conexion, productos, configAgente] = await Promise.all([
      this.obtenerEstadoSuscripcionUseCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio(negocioId)),
      this.whatsappConnectionRepository.findByBusinessId(negocioId),
      this.productRepository.listByBusiness(negocioId, { onlyAvailable: true }),
      this.agentConfigRepository.findByBusinessId(negocioId),
    ]);

    return construirChecklist({
      // Mismo criterio que el bot: con el plan por vencer todavía responde.
      plan_activo: suscripcion.puedeUsarAgente,
      whatsapp_conectado: conexion?.status === WhatsappConnectionStatus.CONNECTED,
      catalogo: productos.length > 0,
      // Sin fila guardada el agente usa valores por defecto: eso no cuenta como configurado.
      agente_configurado: Boolean(configAgente?.tone && configAgente.welcomeMessage?.trim()),
    });
  }
}
