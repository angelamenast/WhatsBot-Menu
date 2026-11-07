export type NoticeType = 'success' | 'info' | 'warning' | 'error';
function prepare() {
  if (document.getElementById('tremia-feedback-style')) return;
  const style = document.createElement('style'); style.id = 'tremia-feedback-style';
  style.textContent = `
    .tremia-notices{position:fixed;right:24px;bottom:24px;z-index:10000;display:flex;flex-direction:column;gap:12px;width:min(390px,calc(100vw - 32px));pointer-events:none;font-family:inherit}
    .tremia-notice{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;padding:18px;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:18px;background:var(--color-surface-container-lowest,#fff);color:var(--color-on-surface,#1f1b17);box-shadow:0 12px 40px #7c2d121a;animation:tremia-feedback-in .18s ease-out}
    .tremia-notice p{margin:0;white-space:pre-line;font-size:14px;line-height:1.5;flex:1}.tremia-notice-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#fff7ed;color:#ea580c;font-weight:700;flex-shrink:0}
    .tremia-notice-close{border:0;background:transparent;color:#78716c;padding:0 2px;cursor:pointer;font-size:20px;line-height:1}.tremia-notice[data-kind=error]{border-left-color:#e55b2b}.tremia-notice[data-kind=success]{border-left-color:#f97316}
    .tremia-dialog-backdrop{position:fixed;inset:0;z-index:10001;background:#1f1b1766;backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px;font-family:inherit}
    .tremia-dialog{width:min(440px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:var(--color-surface-container-lowest,#fff);color:var(--color-on-surface,#1f1b17);padding:28px;border-radius:24px;border:1px solid #fed7aa;box-shadow:0 20px 80px #43140733;animation:tremia-feedback-in .18s ease-out}
    .tremia-dialog h2{font-size:20px;font-weight:700;margin:0 0 12px}.tremia-dialog p{font-size:14px;line-height:1.6;color:#78716c;white-space:pre-line;margin:0 0 20px}.tremia-dialog label{display:block;font-size:13px;font-weight:600;margin:14px 0}
    .tremia-dialog input{display:block;width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #e7e5e4;border-radius:12px;background:#fffbf9;padding:11px 13px;color:#1f1b17;font:inherit}.tremia-dialog input:focus{outline:2px solid #fed7aa;border-color:#f97316}
    .tremia-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.tremia-dialog button{border:0;border-radius:12px;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer}.tremia-dialog-cancel{background:#f5f5f4;color:#57534e}.tremia-dialog-accept{background:var(--color-primary,#f97316);color:white}.tremia-dialog-accept:hover{background:#ea580c}
    @keyframes tremia-feedback-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-reduced-motion:reduce){.tremia-notice,.tremia-dialog{animation:none}}
    @media(max-width:480px){.tremia-notices{right:16px;bottom:16px}.tremia-dialog{padding:24px}}
  `;
  document.head.append(style);
}
export function notify(message: string, type: string = 'info') {
  prepare();
  let container = document.getElementById('tremia-notices');
  if (!container) { container = document.createElement('div'); container.id = 'tremia-notices'; container.className = 'tremia-notices'; container.setAttribute('aria-label', 'Notificaciones'); document.body.append(container); }
  const notice = document.createElement('div'); notice.className = 'tremia-notice'; notice.dataset.kind = type;
  notice.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = document.createElement('span'); icon.className = 'tremia-notice-icon'; icon.textContent = type === 'success' ? '✓' : type === 'error' || type === 'warning' ? '!' : 'i'; icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('p'); text.textContent = message;
  const close = document.createElement('button'); close.className = 'tremia-notice-close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar notificación'); close.addEventListener('click', () => notice.remove());
  notice.append(icon, text, close); container.append(notice);
  while (container.children.length > 3) container.firstElementChild?.remove();
  setTimeout(() => notice.remove(), type === 'error' ? 9000 : 6500);
}
interface Field { name: string; label: string; value?: string }
let activeDialog = false;
function dialog(title: string, message: string, fields: Field[], acceptLabel: string): Promise<Record<string, string> | null> {
  if (activeDialog) return Promise.resolve(null);
  activeDialog = true; prepare();
  const previousFocus = document.activeElement as HTMLElement | null;
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'tremia-dialog-backdrop';
    const form = document.createElement('form'); form.className = 'tremia-dialog'; form.setAttribute('role', 'dialog'); form.setAttribute('aria-modal', 'true'); form.setAttribute('aria-labelledby', 'tremia-dialog-title'); form.setAttribute('aria-describedby', 'tremia-dialog-message');
    const heading = document.createElement('h2'); heading.id = 'tremia-dialog-title'; heading.textContent = title;
    const description = document.createElement('p'); description.id = 'tremia-dialog-message'; description.textContent = message;
    form.append(heading, description);
    for (const field of fields) { const label = document.createElement('label'); label.textContent = field.label; const input = document.createElement('input'); input.name = field.name; input.value = field.value || ''; label.append(input); form.append(label); }
    const actions = document.createElement('div'); actions.className = 'tremia-dialog-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'tremia-dialog-cancel'; cancel.textContent = 'Cancelar';
    const accept = document.createElement('button'); accept.type = 'submit'; accept.className = 'tremia-dialog-accept'; accept.textContent = acceptLabel;
    actions.append(cancel, accept); form.append(actions); overlay.append(form); document.body.append(overlay);
    const finish = (result: Record<string, string> | null) => { overlay.remove(); activeDialog = false; previousFocus?.focus(); resolve(result); };
    cancel.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
    form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); finish(Object.fromEntries(fields.map(field => [field.name, String(data.get(field.name) || '')]))); });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      if (event.key === 'Tab') { const controls = [...form.querySelectorAll<HTMLElement>('input,button')]; const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    });
    (form.querySelector('input') || cancel).focus();
  });
}
export async function confirmAction(message: string, title = 'Confirmar acción', acceptLabel = 'Continuar') { return (await dialog(title, message, [], acceptLabel)) !== null; }
export function editFields(title: string, fields: Field[]) { return dialog(title, 'Los cambios se guardarán en la configuración de tu negocio.', fields, 'Guardar cambios'); }
