import { DEFAULT_UNAVAILABLE_MESSAGE, DEFAULT_WELCOME_MESSAGE } from '../constants/agent-defaults';
import {
  AgentRegionalStyle,
  AgentTone,
  DEFAULT_AGENT_REGIONAL_STYLE,
  DEFAULT_AGENT_TONE,
} from '../enums/agent-style';

export interface AgentConfigProps {
  id: string;
  businessId: string;
  personality: string | null;
  tone: AgentTone | null;
  regionalStyle: AgentRegionalStyle | null;
  welcomeMessage: string | null;
  unavailableMessage: string | null;
  businessHours: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentConfig {
  private constructor(private props: AgentConfigProps) {}

  static create(props: AgentConfigProps): AgentConfig {
    return new AgentConfig(props);
  }

  /**
   * Config por defecto cuando el negocio aún no ha configurado su agente. Es la MISMA que usa
   * el bot al responder, la que devuelve GET /agent/config sin fila y la base del primer PATCH.
   */
  static default(businessId: string): AgentConfig {
    const now = new Date();
    return new AgentConfig({
      id: businessId,
      businessId,
      personality: null,
      tone: null,
      regionalStyle: null,
      welcomeMessage: DEFAULT_WELCOME_MESSAGE,
      unavailableMessage: DEFAULT_UNAVAILABLE_MESSAGE,
      businessHours: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Aplica cambios parciales (undefined = "no tocar este campo", null = "borrarlo"). */
  updateDetails(params: {
    personality?: string | null;
    tone?: AgentTone | null;
    regionalStyle?: AgentRegionalStyle | null;
    welcomeMessage?: string | null;
    unavailableMessage?: string | null;
    businessHours?: Record<string, unknown> | null;
  }): void {
    if (params.personality !== undefined)
      this.props.personality = params.personality;
    if (params.tone !== undefined) this.props.tone = params.tone;
    if (params.regionalStyle !== undefined)
      this.props.regionalStyle = params.regionalStyle;
    if (params.welcomeMessage !== undefined)
      this.props.welcomeMessage = params.welcomeMessage;
    if (params.unavailableMessage !== undefined)
      this.props.unavailableMessage = params.unavailableMessage;
    if (params.businessHours !== undefined)
      this.props.businessHours = params.businessHours;
    this.props.updatedAt = new Date();
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get personality(): string | null {
    return this.props.personality;
  }
  get tone(): AgentTone | null {
    return this.props.tone;
  }
  get regionalStyle(): AgentRegionalStyle | null {
    return this.props.regionalStyle;
  }
  /** Tono que se aplica: el configurado o, si es null, el por defecto. */
  get effectiveTone(): AgentTone {
    return this.props.tone ?? DEFAULT_AGENT_TONE;
  }
  /** Estilo regional que se aplica: el configurado o, si es null, el por defecto. */
  get effectiveRegionalStyle(): AgentRegionalStyle {
    return this.props.regionalStyle ?? DEFAULT_AGENT_REGIONAL_STYLE;
  }
  get welcomeMessage(): string | null {
    return this.props.welcomeMessage;
  }
  get unavailableMessage(): string | null {
    return this.props.unavailableMessage;
  }
  get businessHours(): Record<string, unknown> | null {
    return this.props.businessHours;
  }
}
