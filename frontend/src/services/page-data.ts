// Los datos del HTML son solo una plantilla visual: no se muestran hasta cargar la API.
export function setText(selector: string, value: unknown, scope: ParentNode = document) {
  const simpleId = /^#([\w-]+)$/.exec(selector);
  const element = simpleId && 'getElementById' in scope
    ? (scope as Document).getElementById(simpleId[1])
    : scope.querySelector(selector);
  if (element) element.textContent = String(value ?? '');
}

export function showBusinessSetup() {
  const content = document.querySelector<HTMLElement>('[data-page-content]');
  if (!content) return;
  const section = document.createElement('section');
  section.dataset.businessSetup = '';
  section.className = 'max-w-2xl mx-auto my-8 bg-white border border-orange-100 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col items-start gap-4';
  const icon = document.createElement('span'); icon.className = 'material-symbols-outlined text-orange-500 bg-orange-50 p-3 rounded-2xl text-3xl'; icon.textContent = 'storefront'; icon.setAttribute('aria-hidden','true');
  const title = document.createElement('h1'); title.className = 'text-2xl font-bold text-zinc-900'; title.textContent = 'Tu cuenta está lista';
  const message = document.createElement('p'); message.className = 'text-sm text-zinc-600 leading-relaxed'; message.textContent = 'Registra tu negocio para empezar a gestionar pedidos y configurar tu agente.';
  const link = document.createElement('a'); link.className = 'inline-flex items-center justify-center px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors'; link.href = '/profile'; link.textContent = 'Registrar mi negocio';
  const note = document.createElement('p'); note.className = 'text-xs text-zinc-500'; note.textContent = 'Puedes vincular tu número de WhatsApp después, desde Configuración.';
  section.append(icon, title, message, link, note); content.replaceChildren(section);
}

export async function loadPageData(load: () => Promise<unknown>) {
  const root = document.documentElement;
  const content = document.querySelector<HTMLElement>('[data-page-content]');
  const message = document.querySelector<HTMLElement>('[data-page-message]');
  const retry = document.querySelector<HTMLButtonElement>('[data-page-retry]');
  const loader = document.querySelector('[data-page-loader]');
  root.dataset.appState = 'loading';
  content?.setAttribute('aria-busy', 'true');
  content?.setAttribute('inert', '');
  if (message) message.textContent = 'Cargando tu información…';
  loader?.setAttribute('role', 'status');
  if (retry) { retry.hidden = true; retry.onclick = () => location.reload(); }
  try {
    await load();
    root.dataset.appState = 'ready';
    content?.setAttribute('aria-busy', 'false');
    content?.removeAttribute('inert');
  } catch (error) {
    // Un fallo de red no equivale a un saldo o listado vacío. La plantilla sigue oculta.
    root.dataset.appState = 'error';
    loader?.setAttribute('role', 'alert');
    content?.setAttribute('aria-busy', 'false');
    if (message) message.textContent = 'No pudimos cargar tu información. Vuelve a intentarlo.';
    if (retry) retry.hidden = false;
    throw error;
  }
}
