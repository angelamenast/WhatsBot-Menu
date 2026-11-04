// TREMIA-104: pasos que un negocio debe completar antes de activar la atención automática.
export type ClaveChecklist = 'plan_activo' | 'whatsapp_conectado' | 'catalogo' | 'agente_configurado';

export interface ItemChecklist {
  clave: ClaveChecklist;
  completo: boolean;
  label: string;
}

export interface ChecklistNegocio {
  items: ItemChecklist[];
  completo: boolean;
  porcentaje: number;
}

// El orden de esta lista es el orden en que el front muestra los pasos.
const LABELS: Record<ClaveChecklist, string> = {
  plan_activo: 'Plan activo',
  whatsapp_conectado: 'WhatsApp vinculado',
  catalogo: 'Al menos 1 producto en el catálogo',
  agente_configurado: 'Agente configurado (tono y mensaje de bienvenida)',
};

export function construirChecklist(estados: Record<ClaveChecklist, boolean>): ChecklistNegocio {
  const items = (Object.keys(LABELS) as ClaveChecklist[]).map(clave => ({
    clave,
    completo: estados[clave],
    label: LABELS[clave],
  }));
  const completos = items.filter(item => item.completo).length;

  return {
    items,
    completo: completos === items.length,
    porcentaje: Math.round((completos / items.length) * 100),
  };
}
