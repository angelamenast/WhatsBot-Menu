import { ApiError, isPlanExpired } from '../api/http';
import { platform, type Order } from './platform';
import { notify, confirmAction } from './notifications';
import { ORDER_STATUSES, STATUS_LABELS, actionCopy, bogotaDate, confirmedSales, dateRangeError, formatPhone, matchesSearch, mergeOrder, orderActions, shortRef } from './orders-data';

const POLL_MS = 25000; // Sin push: polling cada 25 s (límite del backend: 60/min por IP).
const money = (amount: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';

export async function initOrders() {
  const board = document.querySelector<HTMLElement>('[data-integration="orders-board"]');
  if (!board) return;
  const search = document.getElementById('orderSearchInput') as HTMLInputElement;
  const from = document.getElementById('orders-from') as HTMLInputElement;
  const to = document.getElementById('orders-to') as HTMLInputElement;
  const summary = document.getElementById('orders-summary')!;
  const empty = document.getElementById('orders-empty')!;
  const detail = document.getElementById('order-detail') as HTMLDialogElement;
  let data: Order[] = [];
  let writable = false;
  let busy = false;
  let loaded = false;
  let request = 0;
  let updatedAt = '';
  from.max = to.max = bogotaDate();

  function actionButtons(order: Order) {
    return orderActions(order.status).map(action => {
      const button = el('button', 'ob-button', action === 'confirm' ? 'Confirmar' : 'Cancelar');
      button.type = 'button'; button.dataset.kind = action; button.disabled = !writable || busy;
      if (!writable) button.title = 'Tu plan venció: renueva para modificar pedidos.';
      button.addEventListener('click', () => { void run(order, action); });
      return button;
    });
  }

  function card(order: Order) {
    const node = el('article', 'ob-card'); node.dataset.status = order.status;
    node.setAttribute('aria-label', `Pedido ${shortRef(order.id)}`);
    const top = el('div', 'ob-card-top');
    const left = el('div'); left.append(el('span', 'ob-ref', '#' + shortRef(order.id)), el('span', 'ob-time', new Date(order.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })));
    const right = el('div'); right.style.textAlign = 'right'; right.append(el('span', 'ob-total', money(order.total)), el('span', 'ob-meta', order.items.length === 1 ? '1 ítem' : order.items.length + ' ítems'));
    top.append(left, right);
    const phone = el('div', 'ob-phone'); const icon = el('span', 'material-symbols-outlined', 'chat'); icon.setAttribute('aria-hidden', 'true'); phone.append(icon, el('span', '', formatPhone(order.customerPhone)));
    const items = order.items.map(item => `${item.quantity}× ${item.productName}`).join(', ');
    const actions = el('div', 'ob-actions');
    const open = el('button', 'ob-button', 'Ver detalle'); open.type = 'button'; open.dataset.kind = 'detail'; open.addEventListener('click', () => showDetail(order));
    actions.append(open, ...actionButtons(order));
    node.append(top, phone, el('p', 'ob-summary', items || 'Sin ítems registrados'), actions);
    return node;
  }

  function showDetail(order: Order) {
    document.getElementById('order-detail-title')!.textContent = 'Pedido #' + shortRef(order.id);
    const body = document.getElementById('order-detail-body')!;
    const dl = el('dl', 'ob-dl');
    for (const [term, value] of [['Estado', STATUS_LABELS[order.status].replace(/s$/, '')], ['Cliente', formatPhone(order.customerPhone)], ['Creado', new Date(order.createdAt).toLocaleString('es-CO')], ['Actualizado', new Date(order.updatedAt).toLocaleString('es-CO')]]) dl.append(el('dt', '', term), el('dd', '', value));
    const table = el('table', 'ob-table');
    const head = el('thead'); const headRow = el('tr'); for (const title of ['Producto', 'Cant.', 'Precio unit.', 'Subtotal']) headRow.append(el('th', '', title)); head.append(headRow);
    const rows = el('tbody');
    for (const item of order.items) { const row = el('tr'); row.append(el('td', '', item.productName), el('td', '', String(item.quantity)), el('td', '', money(item.unitPrice)), el('td', '', money(item.subtotal))); rows.append(row); }
    if (!order.items.length) { const row = el('tr'); const cell = el('td', '', 'Este pedido no tiene ítems registrados.'); cell.colSpan = 4; row.append(cell); rows.append(row); }
    const foot = el('tfoot'); const footRow = el('tr'); const label = el('td', '', 'Total'); label.colSpan = 3; footRow.append(label, el('td', '', money(order.total))); foot.append(footRow);
    table.append(head, rows, foot);
    const wrap = el('div', 'ob-table-wrap'); wrap.append(table);
    body.replaceChildren(dl, wrap);
    detail.showModal();
  }

  function render() {
    const query = search.value;
    const visible = data.filter(order => matchesSearch(order, query));
    for (const status of ORDER_STATUSES) {
      const column = board!.querySelector<HTMLElement>(`[data-status="${status}"]`)!;
      const orders = visible.filter(order => order.status === status);
      column.querySelector('[data-count]')!.textContent = String(orders.length);
      column.querySelector('[data-list]')!.replaceChildren(...orders.map(card));
    }
    document.getElementById('orders-plan-notice')!.hidden = !loaded || writable;
    const filtered = Boolean(from.value || to.value);
    empty.hidden = !loaded || visible.length > 0;
    empty.textContent = data.length ? 'Ningún pedido coincide con la búsqueda.' : filtered ? 'No hay pedidos en ese rango de fechas.' : 'Aún no tienes pedidos. El agente los crea cuando un cliente termina su pedido por WhatsApp.';
    if (loaded) summary.textContent = `${data.length} ${data.length === 1 ? 'pedido' : 'pedidos'}${filtered ? ' en el rango elegido' : ''} · actualizado ${updatedAt}`;
    // Ventas de hoy (Bogotá) con los pedidos cargados; sin dato si el rango excluye hoy.
    const today = bogotaDate();
    const sales = document.querySelector('[data-integration="orders-header"] .text-lg.font-extrabold');
    if (sales) sales.textContent = (from.value && from.value > today) || (to.value && to.value < today) ? '—' : money(confirmedSales(data, today));
  }

  async function load() {
    const range = dateRangeError(from.value, to.value);
    if (range) { summary.textContent = range; return; }
    const current = ++request;
    const status = await platform.subscription();
    const collected: Order[] = [];
    let offset = 0;
    for (;;) {
      const query = new URLSearchParams({ limit: '100', offset: String(offset) });
      if (from.value) query.set('from', from.value);
      if (to.value) query.set('to', to.value);
      const page = await platform.orders(query);
      collected.push(...page.data); offset += page.data.length;
      if (!page.data.length || offset >= page.total) break;
    }
    if (current !== request) return;
    writable = status.puedeEditar; data = collected; loaded = true;
    updatedAt = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    render();
  }

  function replace(order: Order) { data = data.map(item => item.id === order.id ? mergeOrder(item, order) : item); }

  async function run(order: Order, action: 'confirm' | 'cancel') {
    if (busy || !writable) return;
    const copy = actionCopy[action];
    if (!(await confirmAction(copy.message(shortRef(order.id)), copy.title, copy.accept))) return;
    busy = true; render();
    try {
      replace(await platform.orderAction(order.id, action));
      notify(`Pedido #${shortRef(order.id)} ${action === 'confirm' ? 'confirmado' : 'cancelado'}. El aviso al cliente por WhatsApp se envía aparte.`, 'success');
      await load().catch(() => {});
    } catch (error) {
      if (isPlanExpired(error)) { writable = false; notify(errorText(error), 'error'); }
      else if (error instanceof ApiError && error.status === 409) {
        // Otro proceso cambió el estado: se vuelve a leer el pedido y se re-renderiza.
        notify(errorText(error), 'warning');
        try { replace(await platform.order(order.id)); } catch (inner) { if (inner instanceof ApiError && inner.status === 404) data = data.filter(item => item.id !== order.id); }
      } else if (error instanceof ApiError && error.status === 404) { data = data.filter(item => item.id !== order.id); notify('Ese pedido ya no existe.', 'warning'); }
      else notify(errorText(error), 'error');
    } finally { busy = false; render(); }
  }

  const reload = () => { void load().catch(error => { summary.textContent = 'No se pudieron cargar los pedidos: ' + errorText(error); }); };
  search.addEventListener('input', render);
  for (const input of [from, to]) input.addEventListener('change', reload);
  document.getElementById('orders-today')!.addEventListener('click', () => { from.value = to.value = bogotaDate(); reload(); });
  document.getElementById('orders-clear')!.addEventListener('click', () => { from.value = to.value = ''; reload(); });
  document.getElementById('orders-filter-form')!.addEventListener('submit', event => event.preventDefault());
  detail.querySelector('[data-close]')!.addEventListener('click', () => detail.close());
  detail.addEventListener('click', event => { if (event.target === detail) detail.close(); });
  // Polling pausado con la pestaña oculta; al volver se refresca de inmediato.
  setInterval(() => { if (!document.hidden && !busy) reload(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  await load();
}
