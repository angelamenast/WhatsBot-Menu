import { notify } from './notifications';
import { syncUserSession } from './userSession';
import { pendingSteps, type OnboardingStep } from './onboarding';

function prepare() {
  if (document.getElementById('onboarding-style')) return;
  const style = document.createElement('style'); style.id = 'onboarding-style';
  style.textContent = `
    .onb{display:flex;flex-direction:column;gap:12px;margin:0 0 24px;padding:20px;border:2px solid #fb923c;border-radius:16px;background:#fff7ed;color:#431407}
    .onb h2{display:flex;align-items:center;gap:8px;margin:0;font-size:17px;font-weight:800}
    .onb h2 .material-symbols-outlined{color:#ea580c}
    .onb p{margin:0;font-size:14px}.onb .onb-why{font-weight:700}.onb .onb-note{font-size:13px;color:#9a3412}
    .onb-continue{align-self:flex-start;border:0;border-radius:10px;padding:10px 16px;background:#f97316;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
    .onb-continue:hover{background:#ea580c}.onb-continue:disabled{opacity:.6;cursor:wait}.onb-continue:focus-visible{outline:3px solid #fdba74;outline-offset:2px}
  `;
  document.head.append(style);
}

/** Aviso arriba del contenido mientras falte crear la contraseña. */
// Nombre de la sección de la que se redirigió, para explicar por qué se volvió a Perfil.
const SECTION_NAMES: Record<string, string> = { '/orders': 'Pedidos', '/customization': 'Personalización', '/catalog': 'Catálogo', '/billing': 'Facturación', '/vincular-whatsapp': 'Vinculación', '/checkout/plans': 'Planes', '/checkout/payment': 'Pago' };
const REDIRECT_KEY = 'onboarding-redirect-from';
export function rememberRedirect(path: string) { try { sessionStorage.setItem(REDIRECT_KEY, path); } catch { /* sin sessionStorage solo falta la explicación */ } }
function takeRedirect() { try { const path = sessionStorage.getItem(REDIRECT_KEY); sessionStorage.removeItem(REDIRECT_KEY); return path; } catch { return null; } }

/** Aviso arriba del contenido mientras falte el paso obligatorio de crear la contraseña. */
export function showOnboardingBanner(pending: OnboardingStep[]) {
  document.getElementById('onboarding-banner')?.remove();
  const content = document.querySelector<HTMLElement>('[data-page-content]');
  if (!content || !pending.length) return;
  prepare();
  const step = pending[0];
  const banner = document.createElement('section'); banner.id = 'onboarding-banner'; banner.className = 'onb';
  banner.setAttribute('role', 'alert'); banner.setAttribute('aria-labelledby', 'onboarding-title');
  const title = document.createElement('h2'); title.id = 'onboarding-title';
  const icon = document.createElement('span'); icon.className = 'material-symbols-outlined'; icon.textContent = 'key'; icon.setAttribute('aria-hidden', 'true');
  title.append(icon, 'Falta un paso obligatorio: crear tu contraseña');
  const help = document.createElement('p'); help.textContent = step.help;
  const scope = document.createElement('p'); scope.className = 'onb-note';
  scope.textContent = 'Es el único paso que falta y es obligatorio: hasta crearla no podrás entrar a las demás secciones. Tu nombre y los datos del negocio no completan este paso.';
  const from = takeRedirect();
  const parts: HTMLElement[] = [title];
  if (from) { const why = document.createElement('p'); why.className = 'onb-why'; why.textContent = 'Te trajimos aquí desde ' + (SECTION_NAMES[from] ?? 'otra sección') + ' porque falta este paso.'; parts.push(why); }
  const go = document.createElement('button'); go.type = 'button'; go.className = 'onb-continue'; go.textContent = 'Crear mi contraseña';
  go.addEventListener('click', () => { void advance(go); });
  parts.push(help, scope, go);
  banner.append(...parts);
  content.prepend(banner);
}

// Vuelve a leer la cuenta: si ya tiene contraseña, lleva al panel.
async function advance(button: HTMLButtonElement) {
  button.disabled = true;
  try {
    const account = await syncUserSession();
    if (!pendingSteps(account?.hasPassword ?? true).length) { notify('¡Listo! Ya puedes entrar con tu correo y contraseña.', 'success'); location.assign('/orders'); return; }
    document.getElementById('password-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (document.getElementById('new-password') as HTMLInputElement | null)?.focus({ preventScroll: true });
  } catch (error) {
    notify(error instanceof Error ? error.message : 'No se pudo comprobar tu cuenta.', 'error');
  } finally { button.disabled = false; }
}
