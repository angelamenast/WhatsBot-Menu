export interface MissingStep { clave: string; label: string }
// Dónde completa el dueño cada paso del checklist que devuelve el backend.
export const CHECKLIST_LINKS: Record<string, { href: string; text: string }> = {
  plan_activo: { href: '/billing', text: 'Ver planes' },
  whatsapp_conectado: { href: '/vincular-whatsapp', text: 'Vincular WhatsApp' },
  catalogo: { href: '#catalog', text: 'Añadir productos' },
  agente_configurado: { href: '#personality', text: 'Configurar agente' },
};
// El 409 también se usa cuando cambia la sesión: en ese caso no trae faltantes y devuelve una lista vacía.
export function missingSteps(error: unknown): MissingStep[] {
  const { status, details } = (error ?? {}) as { status?: number; details?: { faltantes?: unknown } };
  if (status !== 409 || !Array.isArray(details?.faltantes)) return [];
  return details.faltantes.filter((step): step is MissingStep => typeof step?.clave === 'string' && typeof step?.label === 'string');
}
// null: ningún endpoint de lectura informa el valor guardado; solo se conoce tras un PATCH correcto.
export function attentionStateText(active: boolean | null) {
  if (active === null) return 'Estado sin confirmar: esta pantalla aún no puede leer si está encendida. Usa el interruptor para encenderla o el botón para apagarla.';
  return active ? 'Encendida: el agente atiende a tus clientes por WhatsApp.' : 'Apagada: el agente no atiende automáticamente a tus clientes.';
}
