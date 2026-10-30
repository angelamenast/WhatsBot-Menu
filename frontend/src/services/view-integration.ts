import { platform, type Plan, type Order, type Business, type Subscription } from './platform';
import { ApiError } from '../api/http';
import { syncUserSession } from './userSession';
import { notify, confirmAction } from './notifications';
import { setText as text, loadPageData, showBusinessSetup } from './page-data';

// La integración modifica datos y eventos de los componentes originales, no su diseño.
const path = location.pathname.replace(/\/$/, '') || '/';
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const value = (id: string) => $<HTMLInputElement>('#' + id)?.value.trim() || '';
const input = (id: string, content: string) => { const element = $<HTMLInputElement>('#' + id); if (element) element.value = content; };
const money = (amount: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
const failure = (error: unknown) => notify(error instanceof Error ? error.message : 'No se pudo completar la operación.', 'error');
async function act(element: HTMLButtonElement | null, action: () => Promise<void>) {
  if (element?.dataset.busy) return;
  if (element) { element.dataset.busy = 'true'; element.disabled = true; }
  try { await action(); } catch (error) { failure(error); }
  finally { if (element) { delete element.dataset.busy; element.disabled = false; } }
}
function captureClick(selector: string, action: (element: HTMLElement) => void) {
  document.addEventListener('click', event => {
    const element = (event.target as Element).closest<HTMLElement>(selector);
    if (!element) return;
    event.preventDefault(); event.stopImmediatePropagation(); action(element);
  }, true);
}
function captureForm(id: string, action: () => Promise<void>) {
  document.addEventListener('submit', event => {
    if ((event.target as Element).id !== id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void act($<HTMLButtonElement>(`#${id} button[type="submit"]`), action);
  }, true);
}
let business: Business | null = null;
let subscription: Subscription | null = null;
let plans: Plan[] = [];

async function profile() {
  const [{ user }, mine] = await Promise.all([platform.me(), platform.business()]);
  business = mine;
  // Sin el proveedor email la cuenta no tiene contraseña: el perfil ofrece crearla.
  const providers = user.app_metadata?.providers;
  const createPassword = Array.isArray(providers) && !providers.includes('email');
  window.dispatchEvent(new CustomEvent('password-mode', { detail: { create: createPassword } }));
  input('admin-name', user.user_metadata.nombre || user.user_metadata.full_name || '');
  input('business-name', mine?.nombreNegocio || '');
  text('#current-email-display', user.email);
  text('#avatar-initials', (value('admin-name') || 'U').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase());
  const emailButton = $<HTMLButtonElement>('#email-form button[type="submit"]');
  const validateEmail = () => { if (emailButton) emailButton.disabled = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('new-email')) || value('new-email') !== value('confirm-new-email'); };
  $('#email-form')?.addEventListener('input', validateEmail);
  captureForm('profile-form', async () => {
    const name = value('admin-name'); const businessName = value('business-name');
    if (!name) throw new Error('Escribe tu nombre.');
    if (businessName) {
      business = await platform.saveBusiness(Boolean(business), { nombre_negocio: businessName, descripcion: business?.descripcion || undefined });
    }
    await platform.profile({ nombre: name }); await syncUserSession();
    notify(business ? 'Perfil y negocio guardados en el servidor.' : 'Perfil guardado. Puedes registrar tu negocio cuando estés listo.', 'success');
  });
  captureForm('email-form', async () => {
    if (value('new-email') !== value('confirm-new-email')) throw new Error('Los correos no coinciden.');
    await platform.profile({ email: value('new-email') });
    notify('Revisa tu correo y confirma el cambio mediante el enlace de Supabase.', 'success');
  });
  captureForm('password-form', async () => {
    const password = $<HTMLInputElement>('#new-password')?.value || '';
    if (password !== $<HTMLInputElement>('#confirm-new-password')?.value) throw new Error('Las contraseñas no coinciden.');
    await platform.profile(createPassword ? { password } : { password, currentPassword: $<HTMLInputElement>('#current-password')?.value || '' });
    $<HTMLFormElement>('#password-form')?.reset();
    $('#new-password')?.dispatchEvent(new Event('input', { bubbles: true }));
    notify(createPassword ? 'Contraseña creada. Ya puedes entrar también con tu correo.' : 'Contraseña actualizada.', 'success');
  });
  captureClick('#btn-change-avatar, #btn-remove-avatar', () => notify('El backend todavía no ofrece almacenamiento de avatares.'));
  const twoFactor = $<HTMLInputElement>('#toggle-2fa');
  if (twoFactor) twoFactor.checked = false;
  text('#2fa-status-text', 'No configurado');
  captureClick('#toggle-2fa', () => notify('La autenticación de dos factores aún no está implementada en la API.'));
  captureClick('#btn-manage-wa', () => location.assign('/vincular-whatsapp'));
}

const normalize = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
export function resolvePlan(key: string, available: Plan[], billing = 'monthly'): Plan | undefined {
  const exact = available.find(plan => plan.id === key); if (exact) return exact;
  const aliases: Record<string, string[]> = { starter:['starter','gratis','free','basico','basic'], pro:['pro','professional','profesional','lowcost'], enterprise:['enterprise','highcost','premium','empresarial'] };
  const candidates = available.filter(plan => (aliases[key] || [key]).some(alias => normalize(plan.nombre).replace(/mensual|monthly|anual|annual/g, '') === alias));
  // La periodicidad sale de duracionMeses (API), no del nombre del plan.
  return candidates.find(plan => (plan.duracionMeses >= 12) === (billing === 'annual'));
}
const periodLabel = (plan: Plan) => plan.duracionMeses === 1 ? 'mes' : plan.duracionMeses === 12 ? 'año' : `${plan.duracionMeses} meses`;
const billingLabel = (plan: Plan) => plan.duracionMeses === 1 ? 'Mensual' : plan.duracionMeses === 12 ? 'Anual' : `Cada ${plan.duracionMeses} meses`;
function selectedPlan() {
  const query = new URLSearchParams(location.search);
  return resolvePlan(query.get('plan') || localStorage.getItem('checkout_plan') || 'pro', plans, query.get('billing') || localStorage.getItem('checkout_billing') || 'monthly');
}
function updateCheckout() {
  for (const card of document.querySelectorAll<HTMLElement>('.plan-card')) {
    const plan = resolvePlan(card.dataset.plan || '', plans, localStorage.getItem('checkout_billing') || 'monthly');
    const price = card.querySelector<HTMLElement>('.font-display-lg');
    if (price) price.textContent = plan ? money(plan.precio) : 'No disponible';
    const period = card.querySelector<HTMLElement>('.plan-period');
    if (period) period.textContent = plan ? 'COP / ' + periodLabel(plan) : '';
  }
  const plan = selectedPlan();
  for (const selector of ['#summary-plan-title', '#pay-summary-plan']) text(selector, plan?.nombre || 'Selecciona un plan disponible');
  for (const selector of ['#summary-base-price', '#order-total', '#pay-summary-subtotal', '#pay-summary-total']) text(selector, plan ? money(plan.precio) : '—');
  for (const selector of ['#summary-discount-amount', '#pay-summary-discount']) text(selector, money(0));
  for (const selector of ['#summary-plan-billing', '#pay-summary-badge']) text(selector, plan ? billingLabel(plan) : 'Sin seleccionar');
  text('#summary-period', plan ? 'COP / ' + periodLabel(plan) : '');
  const proceed = $<HTMLButtonElement>('#btn-proceed-pay'); if (proceed) proceed.disabled = !plan;
}
async function checkout() {
  plans = await platform.plans(); updateCheckout();
  window.addEventListener('plan-changed', updateCheckout);
  const form = $<HTMLFormElement>('#card-form'); if (form) form.noValidate = true;
  const pay = async () => {
    const plan = selectedPlan(); if (!plan) throw new Error('Este plan no está disponible en la API. Elige otro.');
    if (!(await platform.business())) { notify('Primero registra tu negocio en Perfil.'); location.assign('/profile'); return; }
    // Los datos de tarjeta del diseño no se leen, guardan ni envían. Se pagan en Wompi.
    const result = await platform.checkout(plan.id);
    const url = new URL(result.paymentUrl); if (url.protocol !== 'https:') throw new Error('El enlace de pago no es válido.');
    localStorage.setItem('checkout_subscription', result.suscripcionId);
    form?.reset(); location.assign(url.href);
  };
  captureClick('#btn-proceed-pay', () => {
    const plan = selectedPlan();
    if (!plan) { notify('Selecciona un plan disponible.'); return; }
    localStorage.setItem('checkout_selected_id', plan.id);
    location.assign('/checkout/payment?plan=' + encodeURIComponent(plan.id));
  });
  captureForm('card-form', pay);
  captureClick('#paypal-view button, #wallet-view button, #bank-view button', element => { void act(element as HTMLButtonElement, pay); });
}

// El diseño de facturación viene pintado como plan vencido; el color y la etiqueta salen del estado real.
const billingStatus: Record<string, { label: string; badge: string; dot: string; alert: string; icon: string; iconName: string; pill: string; title: string; cta: string }> = {
  ACTIVO: { label: 'Activo', badge: 'bg-emerald-100 border-emerald-200 text-emerald-700', dot: 'bg-emerald-600', alert: 'from-emerald-50 border-emerald-200', icon: 'bg-emerald-600', iconName: 'check', pill: 'bg-emerald-600', title: 'Tu suscripción está activa', cta: 'Renovar Plan Ahora' },
  POR_VENCER: { label: 'Por vencer', badge: 'bg-amber-100 border-amber-200 text-amber-700', dot: 'bg-amber-500', alert: 'from-amber-50 border-amber-200', icon: 'bg-amber-500', iconName: 'schedule', pill: 'bg-amber-500', title: 'Tu suscripción está por vencer', cta: 'Renovar Plan Ahora' },
  VENCIDO: { label: 'Vencido', badge: 'bg-red-100 border-red-200 text-red-700', dot: 'bg-red-600', alert: 'from-red-50 border-red-200', icon: 'bg-red-600', iconName: 'priority_high', pill: 'bg-red-600', title: 'Tu suscripción venció', cta: 'Renovar Plan Ahora' },
  SIN_PLAN: { label: 'Sin plan', badge: 'bg-zinc-100 border-zinc-200 text-zinc-600', dot: 'bg-zinc-400', alert: 'from-zinc-50 border-zinc-200', icon: 'bg-zinc-500', iconName: 'info', pill: 'bg-zinc-500', title: 'Aún no tienes un plan activo', cta: 'Elegir un plan' },
};
async function billing() {
  subscription = await platform.subscription();
  const status = billingStatus[subscription.estado] || billingStatus.SIN_PLAN;
  const card = $('[data-integration="billing-plan"]');
  if (card) {
    text('h2', subscription.plan?.nombre || 'Sin plan', card);
    text('.font-black', subscription.plan ? money(subscription.plan.precio) : '—', card);
    const badge = card.querySelector<HTMLElement>('[data-billing-badge]');
    const dot = card.querySelector<HTMLElement>('[data-billing-dot]');
    if (badge && dot) {
      badge.className = 'px-2.5 py-0.5 rounded-full border text-xs font-bold flex items-center gap-1 shrink-0 ' + status.badge;
      dot.className = 'w-1.5 h-1.5 rounded-full ' + status.dot;
      badge.replaceChildren(dot, ' ' + status.label);
    }
    text('.text-orange-600.font-bold.block', subscription.fechaFin ? 'Vence: ' + new Date(subscription.fechaFin).toLocaleDateString('es-CO') : 'Sin fecha de vencimiento', card);
    text('.text-xs.font-semibold.text-zinc-500', subscription.plan ? 'COP · ' + billingLabel(subscription.plan) : 'COP', card);
  }
  const alert = $('[data-integration="billing-alert"]');
  if (alert) {
    // Con el plan activo y sin aviso del backend no hay nada que alertar.
    alert.hidden = subscription.estado === 'ACTIVO' && !subscription.alerta;
    alert.className = 'relative overflow-hidden rounded-2xl bg-gradient-to-r via-zinc-100 to-zinc-50 p-4 sm:p-6 border shadow-xs ' + status.alert;
    const icon = alert.querySelector<HTMLElement>('[data-billing-alert-icon]');
    if (icon) { icon.className = 'w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs ' + status.icon; text('.material-symbols-outlined', status.iconName, icon); }
    const pill = alert.querySelector<HTMLElement>('[data-billing-alert-pill]');
    if (pill) { pill.className = 'px-2.5 py-0.5 rounded-full text-white text-[11px] font-extrabold uppercase tracking-wide ' + status.pill; pill.textContent = status.label; }
    text('[data-billing-alert-cta]', status.cta, alert);
    text('h3', subscription.alerta?.mensaje || status.title, alert);
    text('p', subscription.fechaFin ? 'Vigencia hasta ' + new Date(subscription.fechaFin).toLocaleDateString('es-CO') : 'Elige un plan para activar tu suscripción.', alert);
  }
  document.querySelectorAll('[data-integration="billing-invoices"] tbody td').forEach(cell => { cell.textContent = '—'; });
  const table = $('[data-integration="billing-invoices"]'); if (table) text('p', 'La API aún no dispone de facturas para descargar.', table);
  document.querySelectorAll<HTMLElement>('[data-integration="billing-usage"] .text-zinc-900.font-bold').forEach(element => { element.textContent = 'Sin datos'; });
  captureClick('[data-integration="billing-invoices"] button, [data-integration="billing-method"] button, [data-integration="billing-tax"] button', () => notify('Esta función todavía no está disponible en el backend.'));
  captureClick('[data-integration="billing-plan"] a[href*="checkout/payment"], [data-integration="billing-alert"] a[href*="checkout/payment"]', element => {
    void act(element as HTMLButtonElement, async () => {
      if (!subscription?.plan) { location.assign('/checkout/plans'); return; }
      let result;
      try { result = await platform.renew(); } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        if (!(await confirmAction(error.message, 'Renovar anticipadamente', 'Renovar plan'))) return;
        result = await platform.renew(true);
      }
      const url = new URL(result.paymentUrl); if (url.protocol !== 'https:') throw new Error('Enlace de pago inválido.');
      localStorage.setItem('renewal_reference', result.referencia); location.assign(url.href);
    });
  });
  const reference = localStorage.getItem('renewal_reference');
  if (reference) { const result = await platform.renewal(reference); notify(result.mensaje); }
  text('[data-integration="billing-method"] .font-mono', '•••• •••• •••• —');
  document.querySelectorAll('[data-integration="billing-method"] .font-bold.text-zinc-100, [data-integration="billing-tax"] span.font-bold.text-zinc-900').forEach(element => { element.textContent = '—'; });
  document.querySelectorAll('[data-integration="billing-method"] .text-xs.text-zinc-600 span:not(.material-symbols-outlined)').forEach(element => { element.textContent = 'Los métodos de pago se gestionan en Wompi.'; });
}

async function whatsapp() {
  const connection = await platform.connection();
  input('phone-input', connection?.phoneNumber || '');
  text('#qr-timer', connection?.simulated ? 'Modo de prueba' : 'No disponible');
  captureForm('phone-code-form', async () => {
    const result = await platform.connect(value('phone-input'));
    const actual = await platform.connection();
    notify(result.status === 'FAILED' ? 'La conexión falló. Revisa el proveedor.' : actual?.simulated ? 'Conexión de prueba registrada. No se enviaron mensajes reales.' : 'Estado de conexión: ' + result.status, result.status === 'FAILED' ? 'error' : 'info');
  });
  captureClick('#btn-refresh-qr', () => notify('El backend actual vincula por número y no genera códigos QR.'));
  captureClick('#btn-check-status', () => { void act(null, async () => { const result = await platform.connection(); notify(result ? `${result.phoneNumber}: ${result.status}${result.simulated ? ' (prueba)' : ''}` : 'No hay conexión registrada.'); }); });
  if (new URLSearchParams(location.search).get('configure') === 'agent') { location.replace('/customization'); }
}

async function orders() {
  const board = $('[data-integration="orders-board"]'); if (!board) return;
  const columns = [...board.children] as HTMLElement[];
  const lists = columns.map(column => column.children[1] as HTMLElement);
  const templates = lists.map(list => list.firstElementChild!.cloneNode(true) as HTMLElement);
  const itemTemplate = templates[0].querySelector('.text-xs .justify-between.text-zinc-800')?.cloneNode(true) as HTMLElement | undefined;
  const statuses = ['PENDING', 'CONFIRMED', 'CANCELLED'];
  const titles = ['Pendientes', 'Confirmados', 'Cancelados'];
  lists.forEach(list => list.replaceChildren());
  let data: Order[] = [];
  let writable = false;
  const render = () => {
    const query = value('orderSearchInput').toLowerCase();
    columns.forEach((column, index) => {
      const filtered = data.filter(order => order.status === statuses[index] && (order.customerPhone + ' ' + order.id + ' ' + order.items.map(item => item.productName).join(' ')).toLowerCase().includes(query));
      text('h2', titles[index], column);
      const count = column.querySelector('h2')?.nextElementSibling; if (count) count.textContent = String(filtered.length);
      lists[index].replaceChildren();
      for (const order of filtered) {
        const card = templates[index].cloneNode(true) as HTMLElement;
        text('.font-bold.text-zinc-900.text-sm', order.customerPhone, card);
        text('.font-mono', order.customerPhone, card);
        text('.font-black', money(order.total), card);
        text('.text-xs.text-zinc-500', new Date(order.createdAt).toLocaleString('es-CO'), card);
        text('.block.text-zinc-500', order.items.length + ' ítems', card);
        const items = card.querySelector('.flex-col.gap-1.my-2');
        if (items && itemTemplate) {
          items.replaceChildren();
          order.items.forEach(item => {
            const row = itemTemplate.cloneNode(true) as HTMLElement;
            const spans = row.querySelectorAll('span');
            if (spans[0]) spans[0].textContent = item.quantity + 'x';
            if (spans[1]) spans[1].textContent = item.productName;
            if (spans[2]) spans[2].textContent = money(item.subtotal);
            items.append(row);
          });
        }
        const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')];
        buttons.forEach(button => { button.disabled = !writable || order.status !== 'PENDING'; });
        if (order.status === 'PENDING') {
          for (const button of buttons) {
            const label = button.textContent?.trim() || '';
            const action = /rechazar/i.test(label) ? 'cancel' : /aceptar/i.test(label) ? 'confirm' : null;
            if (!action) continue;
            button.addEventListener('click', () => { void act(button, async () => { if (action === 'cancel' && !(await confirmAction('El pedido quedará cancelado.', 'Cancelar pedido', 'Sí, cancelar'))) return; await platform.orderAction(order.id, action); await load(); }); });
          }
        }
        lists[index].append(card);
      }
    });
    text('[data-integration="orders-filters"] button', `Todos (${data.length})`);
    text('[data-integration="orders-header"] .text-lg.font-extrabold', money(data.filter(order => order.status === 'CONFIRMED' && new Date(order.createdAt).toDateString() === new Date().toDateString()).reduce((sum, order) => sum + order.total, 0)));
    const metrics = document.querySelectorAll('[data-integration="orders-header"] .text-lg.font-extrabold');
    if (metrics[1]) metrics[1].textContent = '—';
  };
  async function load() {
    const status = await platform.subscription(); writable = status.puedeEditar;
    const collected: Order[] = []; let offset = 0;
    do {
      const page = await platform.orders(new URLSearchParams({ limit:'100', offset:String(offset) }));
      collected.push(...page.data); offset += page.data.length;
      if (!page.data.length || offset >= page.total) break;
    } while (true);
    data = collected; render();
  }
  $('#orderSearchInput')?.addEventListener('input', render);
  captureClick('[data-integration="orders-header"] button', () => notify('La API genera pedidos desde el agente; todavía no ofrece creación manual.'));
  captureClick('[data-integration="orders-filters"] button', () => { void load().catch(failure); });
  await load();
}

function navigation() {

  const analytics = $<HTMLAnchorElement>('a[href="/analytics"]'); if (analytics) analytics.href = '/orders';
  captureClick('#btn-create-bot', () => location.assign('/customization'));
}

navigation();
if (document.documentElement.dataset.appState === 'loading' && localStorage.getItem('auth_token')) {
  const run = ['/customization','/catalog'].includes(path) ? async () => (await import('./customization')).initCustomization() : path === '/profile' ? profile : path === '/orders' ? orders : path === '/billing' ? billing : path === '/vincular-whatsapp' ? whatsapp : path.startsWith('/checkout/') ? checkout : null;
  void loadPageData(async () => {
    const account = await syncUserSession();
    const requiresBusiness = ['/orders','/billing','/vincular-whatsapp','/customization','/catalog'].includes(path) || path.startsWith('/checkout/');
    if (requiresBusiness && account?.hasBusiness === false) { showBusinessSetup(); return; }
    if (run) await run();
  }).catch(failure);
}
