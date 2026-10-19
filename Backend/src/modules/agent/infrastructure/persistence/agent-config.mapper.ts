import { Logger } from '@nestjs/common';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { parseAgentRegionalStyle, parseAgentTone } from '../../domain/enums/agent-style';

export interface ConfiguracionAgenteRow {
  id: string;
  negocio_id: string;
  personalidad: string | null;
  tono: string | null;
  estilo_regional: string | null;
  mensaje_bienvenida: string | null;
  mensaje_no_disponible: string | null;
  horario_atencion: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export class AgentConfigMapper {
  private static readonly logger = new Logger(AgentConfigMapper.name);

  /**
   * La lectura nunca falla por datos viejos: un tono o estilo desconocido se lee como null
   * y se avisa con ids (nunca con el valor, que es texto del dueño).
   */
  static toDomain(row: ConfiguracionAgenteRow): AgentConfig {
    const tone = parseAgentTone(row.tono);
    const regionalStyle = parseAgentRegionalStyle(row.estilo_regional);

    if (row.tono !== null && tone === null) {
      AgentConfigMapper.logger.warn(
        `Valor de tono desconocido en configuracion_agente ${row.id} (negocio ${row.negocio_id}): se lee como sin configurar`,
      );
    }
    if (row.estilo_regional !== null && regionalStyle === null) {
      AgentConfigMapper.logger.warn(
        `Valor de estilo_regional desconocido en configuracion_agente ${row.id} (negocio ${row.negocio_id}): se lee como sin configurar`,
      );
    }

    return AgentConfig.create({
      id: row.id,
      businessId: row.negocio_id,
      personality: row.personalidad,
      tone,
      regionalStyle,
      welcomeMessage: row.mensaje_bienvenida,
      unavailableMessage: row.mensaje_no_disponible,
      businessHours: row.horario_atencion,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  /** Sin created_at: en un insert lo llena el DEFAULT now() y en una actualización no debe tocarse. */
  static toPersistence(config: AgentConfig): Omit<ConfiguracionAgenteRow, 'created_at'> {
    return {
      id: config.id,
      negocio_id: config.businessId,
      personalidad: config.personality,
      tono: config.tone,
      estilo_regional: config.regionalStyle,
      mensaje_bienvenida: config.welcomeMessage,
      mensaje_no_disponible: config.unavailableMessage,
      horario_atencion: config.businessHours,
      updated_at: new Date().toISOString(),
    };
  }
}
