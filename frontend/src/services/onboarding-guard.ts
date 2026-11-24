import { notify } from './notifications';
import { syncUserSession } from './userSession';
import { pendingSteps, type OnboardingStep } from './onboarding';

function prepare() {
  if (document.getElementById('onboarding-style')) return;
  const style = document.createElement('style'); style.id = 'onboarding-style';
  style.textContent = `
    .onb{display:flex;flex-direction:column;gap:12px;margin:0 0 24px;padding:20px;border:1px solid #fed7aa;border-radius:16px;background:#fff7ed;color:#431407}
    .onb h2{display:flex;align-items:center;gap:8px;margin:0;font-size:17px;font-weight:800}
    .onb h2 .material-symbols-outlined{color:#ea580c}
    .onb p{margin:0;font-size:14px}
    .onb-continue{align-self:flex-start;border:0;border-radius:10px;padding:10px 16px;background:#f97316;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
    .onb-continue:hover{background:#ea580c}.onb-continue:disabled{opacity:.6;cursor:wait}.onb-continue:focus-visible{outline:3px solid #fdba74;outline-offset:2px}
  `;
  document.head.append(style);
}

/** Aviso arriba del contenido mientras falte crear la contraseña. */
export function showOnboardingBanner(pending: OnboardingStep[]) {
  document.getElementById('onboarding-banner')?.remove();
  const content = document.querySelector<HTMLElement>('[data-page-content]');
  if (!content || !pending.length) return;
  prepare();
  const step = pending[0];
  const banner = document.createElement('section'); banner.id = 'onboarding-banner'; banner.className = 'onb';
  banner.setAttribute('aria-labelledby', 'onboarding-title');
  const title = document.createElement('h2'); title.id = 'onboarding-title';
  const icon = document.createElement('span'); icon.className = 'material-symbols-outlined'; icon.textContent = 'key'; icon.setAttribute('aria-hidden', 'true');
  title.append(icon, 'Completa tu inicio de sesión: ' + step.label);
  const help = document.createElement('p'); help.textContent = step.help;
  const next = document.createElement('button'); next.type = 'button'; next.className = 'onb-continue'; next.textContent = 'Continuar';
  next.addEventListener('click', () => { void advance(next); });
  banner.append(title, help, next);
  content.prepend(banner);
}

// Vuelve a leer la cuenta: si ya tiene contraseña, lleva al panel.
async function advance(button: HTMLButtonElement) {
  button.disabled = true;
  try {
    const account = await syncUserSession();
    if (!pendingSteps(account?.hasPassword ?? true).length) { notify('¡Listo! Ya puedes entrar con tu correo y contraseña.', 'success'); location.assign('/orders'); return; }
    notify('Aún falta crear tu contraseña.', 'warning');
    document.getElementById('password-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    notify(error instanceof Error ? error.message : 'No se pudo comprobar tu cuenta.', 'error');
  } finally { button.disabled = false; }
}
