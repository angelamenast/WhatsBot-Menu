import { randomUUID } from 'node:crypto';

export interface AgentConfigProps {
  id: string;
  businessId: string;
  personality: string | null;
  tone: string | null;
  welcomeMessage: string | null;
  businessHours: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentConfig {
  private constructor(private props: AgentConfigProps) {}

  static create(props: AgentConfigProps): AgentConfig {
    return new AgentConfig(props);
  }

  /** Config por defecto cuando el negocio aún no ha configurado su agente. */
  static default(businessId: string): AgentConfig {
    const now = new Date();
    return new AgentConfig({
      id: businessId,
      businessId,
      personality: null,
      tone: null,
      welcomeMessage: '¡Hola! Bienvenido, ¿en qué puedo ayudarte hoy?',
      businessHours: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Crea una configuración nueva y vacía para un negocio que aún no configuró su agente. */
  static initialize(businessId: string): AgentConfig {
    const now = new Date();
    return new AgentConfig({
      id: randomUUID(),
      businessId,
      personality: null,
      tone: null,
      welcomeMessage: null,
      businessHours: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Aplica cambios parciales (undefined = "no tocar este campo", null = "borrarlo"). */
  updateDetails(params: {
    personality?: string | null;
    tone?: string | null;
    welcomeMessage?: string | null;
    businessHours?: Record<string, unknown> | null;
  }): void {
    if (params.personality !== undefined)
      this.props.personality = params.personality;
    if (params.tone !== undefined) this.props.tone = params.tone;
    if (params.welcomeMessage !== undefined)
      this.props.welcomeMessage = params.welcomeMessage;
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
  get tone(): string | null {
    return this.props.tone;
  }
  get welcomeMessage(): string | null {
    return this.props.welcomeMessage;
  }
  get businessHours(): Record<string, unknown> | null {
    return this.props.businessHours;
  }
}
