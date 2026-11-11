import { Injectable } from '@nestjs/common';
import { ObtenerEstadoSuscripcionUseCase } from '../../application/use-cases/obtener-estado-suscripcion.use-case';
import { ObtenerEstadoSuscripcionCommand } from '../../application/dto/obtener-estado-suscripcion.command';

// Implementación real de PlanStatusPort (módulo whatsapp, HU-4.1). Cumple la interfaz
// `isActive(businessId): Promise<boolean>` por tipado estructural, sin importar código de ese
// módulo. El factory de PLAN_STATUS_PORT del WhatsappModule la usa con PLAN_STATUS_PROVIDER=subscriptions
// (el default sigue siendo "fake"). Un negocio SIN plan (SIN_PLAN) tampoco recibe respuesta.
@Injectable()
export class SubscriptionPlanStatusAdapter {
  constructor(private readonly obtenerEstadoSuscripcionUseCase: ObtenerEstadoSuscripcionUseCase) {}

  async isActive(businessId: string): Promise<boolean> {
    const resultado = await this.obtenerEstadoSuscripcionUseCase.execute(
      ObtenerEstadoSuscripcionCommand.porNegocio(businessId),
    );

    return resultado.puedeUsarAgente;
  }
}
