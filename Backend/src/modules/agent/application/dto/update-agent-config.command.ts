export interface UpdateAgentConfigCommand {
  businessId: string;
  personality?: string | null;
  tone?: string | null;
  welcomeMessage?: string | null;
  businessHours?: Record<string, unknown> | null;
}