import { isPlanExpired } from '../api/http';
import { platform, type Agent, type AgentRegionalStyle, type AgentTone, type AgentUpdate } from './platform';
import { readPersonality } from './catalog-data';
import { AGENT_TEXT_MAX, DAYS, agentChanges, hoursTooLong, readHours, textOrNull, writeHours } from './agent-form';

const input = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const show = (message: string, kind = 'success') => { const box = document.getElementById('personality-feedback')!; box.textContent = message; box.dataset.kind = kind; box.hidden = false; };

// Formulario del agente: se prellena con GET /agent/config y se guarda con un PATCH parcial.
export function initAgentForm(agent: Agent, writable: boolean, onSaved: () => void) {
  const form = document.getElementById('personality-form') as HTMLFormElement;
  const fields = document.getElementById('personality-fields') as HTMLFieldSetElement;
  const save = document.getElementById('save-personality') as HTMLButtonElement;
  // Versiones anteriores guardaban "Idioma de respuesta: …" al inicio; el bot siempre responde
  // en español, así que ese prefijo se oculta y desaparece al editar las indicaciones.
  const parsed = readPersonality(agent.personality);
  const hours = readHours(agent.businessHours);
  input('agent-personality').value = parsed.instructions;
  // Un valor desconocido no se pierde al guardar otro campo: se añade como opción.
  for (const [id, value] of [['agent-tone', agent.tone], ['agent-regional', agent.regionalStyle]] as const) {
    const select = input(id) as HTMLSelectElement;
    if (value && ![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
    select.value = value ?? '';
  }
  input('agent-welcome').value = agent.welcomeMessage ?? '';
  input('agent-unavailable').value = agent.unavailableMessage ?? '';
  for (const [key] of DAYS) input('agent-hours-' + key).value = hours.days[key] ?? '';

  const current = (): AgentUpdate => ({
    personality: textOrNull(input('agent-personality').value),
    tone: (input('agent-tone').value || null) as AgentTone | null,
    regionalStyle: (input('agent-regional').value || null) as AgentRegionalStyle | null,
    welcomeMessage: textOrNull(input('agent-welcome').value),
    unavailableMessage: textOrNull(input('agent-unavailable').value),
    businessHours: writeHours(Object.fromEntries(DAYS.map(([key]) => [key, input('agent-hours-' + key).value])), hours.extra),
  });
  let saved = current();
  let saving = false;

  function refresh() {
    for (const id of ['agent-personality', 'agent-welcome', 'agent-unavailable']) document.getElementById(id + '-count')!.textContent = `${input(id).value.length} / ${AGENT_TEXT_MAX} caracteres`;
    // Guardar solo se habilita con cambios pendientes.
    save.disabled = !writable || saving || Object.keys(agentChanges(saved, current())).length === 0;
  }

  fields.disabled = !writable;
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saving || !writable) return;
    const next = current();
    if (hoursTooLong(next.businessHours ?? null)) { show('El horario es demasiado largo: el bot solo lee los primeros 1000 caracteres. Acórtalo.', 'error'); return; }
    if ((next.personality ?? '').length > AGENT_TEXT_MAX) { show('Las instrucciones superan los 500 caracteres.', 'error'); return; }
    const changes = agentChanges(saved, next);
    if (!Object.keys(changes).length) return;
    saving = true; fields.disabled = true; refresh();
    void platform.saveAgent(changes)
      .then(() => { saved = next; show('Configuración guardada. Aplica a los siguientes mensajes del bot.'); onSaved(); })
      .catch(error => {
        if (isPlanExpired(error)) { writable = false; document.getElementById('custom-readonly')!.hidden = false; }
        show(error instanceof Error ? error.message : 'No se pudo guardar la configuración.', 'error');
      })
      .finally(() => { saving = false; fields.disabled = !writable; refresh(); });
  });
  refresh();
}
