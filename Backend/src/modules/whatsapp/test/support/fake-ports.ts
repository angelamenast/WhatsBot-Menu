import type {
  AgentDispatchCommand,
  AgentDispatchPort,
} from '../../application/ports/out/agent-dispatch.port';
import type { MessagingPort, SendMessageParams, SendMessageResult } from '../../application/ports/out/messaging.port';
import type { PlanStatusPort } from '../../application/ports/out/plan-status.port';
import { createDeferred } from './async-helpers';
import type { Deferred } from './async-helpers';

type AgentBehaviour = (command: AgentDispatchCommand) => Promise<string | null>;

/** Agente fake: registra cada despacho y permite fijar respuesta, fallo o una respuesta retenida. */
export class RecordingAgentDispatch implements AgentDispatchPort {
  readonly calls: AgentDispatchCommand[] = [];

  private behaviour: AgentBehaviour = async () => 'Respuesta del agente';
  private readonly oneShot: AgentBehaviour[] = [];

  respondWith(text: string | null): void {
    this.behaviour = async () => text;
  }

  failWith(error: Error): void {
    this.behaviour = async () => {
      throw error;
    };
  }

  /** El PRÓXIMO despacho queda pendiente hasta que se resuelva el diferido devuelto. */
  holdNext(): Deferred<string | null> {
    const deferred = createDeferred<string | null>();
    this.oneShot.push(() => deferred.promise);
    return deferred;
  }

  async dispatch(command: AgentDispatchCommand): Promise<string | null> {
    this.calls.push(command);
    const next = this.oneShot.shift() ?? this.behaviour;
    return next(command);
  }
}

/** Mensajería fake (para las pruebas que no ejercitan el adaptador real de Meta). */
export class RecordingMessaging implements MessagingPort {
  readonly calls: SendMessageParams[] = [];

  private sequence = 0;
  private behaviour: (params: SendMessageParams) => Promise<SendMessageResult> = async () => {
    this.sequence += 1;
    return { providerMessageId: `wamid.OUT.${this.sequence}`, status: 'sent' };
  };

  respondWith(result: SendMessageResult): void {
    this.behaviour = async () => result;
  }

  failWith(error: Error): void {
    this.behaviour = async () => {
      throw error;
    };
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    this.calls.push(params);
    return this.behaviour(params);
  }
}

/** Estado de plan fake: activo por defecto; se desactiva por negocio. */
export class FakePlanStatus implements PlanStatusPort {
  private readonly inactive = new Set<string>();
  private failure: Error | null = null;

  setActive(businessId: string, active: boolean): void {
    if (active) {
      this.inactive.delete(businessId);
    } else {
      this.inactive.add(businessId);
    }
  }

  failWith(error: Error | null): void {
    this.failure = error;
  }

  async isActive(businessId: string): Promise<boolean> {
    if (this.failure) {
      throw this.failure;
    }

    return !this.inactive.has(businessId);
  }
}
