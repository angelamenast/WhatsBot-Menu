import type { ItemChecklist } from '../checklist-negocio';

export class ChecklistIncompletoError extends Error {
  constructor(public readonly faltantes: Pick<ItemChecklist, 'clave' | 'label'>[]) {
    super('Completa la configuración del negocio antes de activar la atención automática');
  }
}
