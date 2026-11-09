// Contrato de GUIA_INTEGRACION_FRONT_ORDERS_AGENT_WHATSAPP (pedidos, agente y WhatsApp).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async (path, replace = text => text) => {
  const source = replace(await readFile(new URL(path, import.meta.url), 'utf8'));
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  return { url, module: await import(url) };
};
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
globalThis.__testEnv = { PUBLIC_API_URL: 'http://localhost:3000/api' };
const http = await load('../src/api/http.ts', text => text.replaceAll('import.meta.env', 'globalThis.__testEnv'));
const { platform } = (await load('../src/services/platform.ts', text => text.replace("'../api/http'", JSON.stringify(http.url)))).module;
const orders = (await load('../src/services/orders-data.ts')).module;
const agent = (await load('../src/services/agent-form.ts')).module;

beforeEach(() => {
  const values = new Map([['auth_token', 'token'], ['refresh_token', 'refresh'], ['tremia_session_version', 'verified-v2']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.document = { cookie: '' };
  globalThis.location = { protocol: 'http:' };
});
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// 1. Convenciones globales
test('429: mensaje en español con Retry-After en vez del texto del Throttler', async () => {
  globalThis.fetch = async () => json({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 429, { 'Retry-After': '42' });
  await assert.rejects(platform.orders(new URLSearchParams()), error => error.status === 429 && /Espera 42 s/.test(error.message));
});
test('403 PLAN_VENCIDO se detecta por codigo, no por el texto', async () => {
  globalThis.fetch = async () => json({ statusCode: 403, error: 'Forbidden', message: 'Tu plan venció. Renueva para editar.', codigo: 'PLAN_VENCIDO' }, 403);
  const error = await platform.orderAction('id', 'confirm').catch(failure => failure);
  assert.equal(http.module.isPlanExpired(error), true);
  assert.equal(http.module.isPlanExpired(new http.module.ApiError(403, 'Forbidden')), false);
});
test('message string[] se normaliza y un 500 muestra un mensaje genérico', async () => {
  globalThis.fetch = async () => json({ statusCode: 400, error: 'Bad Request', message: ['from debe tener formato YYYY-MM-DD', 'limit must not be greater than 100'] }, 400);
  await assert.rejects(platform.orders(new URLSearchParams()), /from debe tener formato YYYY-MM-DD, limit must not be greater than 100/);
  globalThis.fetch = async () => json({ statusCode: 500, message: 'Internal server error' }, 500);
  await assert.rejects(platform.orders(new URLSearchParams()), /error en el servidor/);
});

// 3. Pedidos
test('detalle y acciones de pedido usan las rutas del backend sin body', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push([options.method ?? 'GET', url, options.body]); return json({ id: 'a' }); };
  await platform.order('7d3f0c52-8a41');
  await platform.orderAction('7d3f0c52-8a41', 'cancel');
  assert.deepEqual(calls, [['GET', 'http://localhost:3000/api/orders/7d3f0c52-8a41', undefined], ['PATCH', 'http://localhost:3000/api/orders/7d3f0c52-8a41/cancel', undefined]]);
});
test('acciones válidas por estado: PENDING confirma o cancela, CONFIRMED solo cancela, CANCELLED nada', () => {
  assert.deepEqual(orders.orderActions('PENDING'), ['confirm', 'cancel']);
  assert.deepEqual(orders.orderActions('CONFIRMED'), ['cancel']);
  assert.deepEqual(orders.orderActions('CANCELLED'), []);
});
test('referencia corta de 8 caracteres y teléfono conservado tras confirm/cancel', () => {
  assert.equal(orders.shortRef('7d3f0c52-8a41-4e0b-9a52-1c2f6b9d4e10'), '7d3f0c52');
  const previous = { id: 'a', status: 'PENDING', customerPhone: '573001234567' };
  assert.equal(orders.mergeOrder(previous, { id: 'a', status: 'CONFIRMED' }).customerPhone, '573001234567');
  assert.equal(orders.formatPhone('573001234567'), '+573001234567');
});
test('las fechas de filtro son días de Bogotá (UTC-5) en formato YYYY-MM-DD', () => {
  assert.equal(orders.bogotaDate(new Date('2026-11-08T03:00:00Z')), '2026-11-07');
  assert.equal(orders.bogotaDate(new Date('2026-11-08T15:42:10.123Z')), '2026-11-08');
  assert.equal(orders.dateRangeError('2026-11-08', '2026-11-01'), 'La fecha inicial no puede ser posterior a la final.');
  assert.equal(orders.dateRangeError('2026-11-01', ''), '');
});
test('búsqueda en el cliente y ventas confirmadas del día', () => {
  const list = [
    { id: '7d3f0c52-aaaa', status: 'CONFIRMED', total: 41000, createdAt: '2026-11-08T15:00:00Z', customerPhone: '573001234567', items: [{ productName: 'Hamburguesa clásica' }] },
    { id: '11111111-bbbb', status: 'CONFIRMED', total: 9000, createdAt: '2026-11-08T03:00:00Z', items: [] },
    { id: '22222222-cccc', status: 'PENDING', total: 5000, createdAt: '2026-11-08T16:00:00Z', items: [] },
  ];
  assert.equal(orders.matchesSearch(list[0], 'hamburguesa'), true);
  assert.equal(orders.matchesSearch(list[0], '7d3f0c52'), true);
  assert.equal(orders.matchesSearch(list[1], '3001234'), false);
  assert.equal(orders.confirmedSales(list, '2026-11-08'), 41000);
});

// 4. Agente
test('PATCH /agent/config envía solo los campos modificados y null para borrar', async () => {
  const saved = { personality: null, tone: 'AMABLE', regionalStyle: null, welcomeMessage: 'Hola', unavailableMessage: 'Cerrado', businessHours: { lunes: '10:00-22:00' } };
  const next = { ...saved, tone: 'CERCANO', regionalStyle: 'PAISA', welcomeMessage: agent.textOrNull('   '), businessHours: agent.writeHours({ lunes: '10:00-22:00' }) };
  const changes = agent.agentChanges(saved, next);
  assert.deepEqual(changes, { tone: 'CERCANO', regionalStyle: 'PAISA', welcomeMessage: null });
  let body;
  globalThis.fetch = async (_url, options) => { body = JSON.parse(options.body); assert.equal(options.method, 'PATCH'); return json({ ...saved, ...changes }); };
  await platform.saveAgent(changes);
  assert.deepEqual(body, { tone: 'CERCANO', regionalStyle: 'PAISA', welcomeMessage: null });
});
test('personality incluye el idioma dentro del límite de 500 y queda null si no hay nada', () => {
  assert.equal(agent.writePersonality('Español', '  '), null);
  assert.equal(agent.writePersonality('Inglés', ''), 'Idioma de respuesta: Inglés.\n\n');
  assert.equal(agent.instructionsMax('Español') + agent.personalityPrefix('Español').length, 500);
});
test('businessHours se lee y escribe con el mismo esquema y conserva claves ajenas', () => {
  const { days, extra } = agent.readHours({ lunes: '10:00-22:00', domingo: 'cerrado', nota: 'festivos cerrado' });
  assert.deepEqual(days, { lunes: '10:00-22:00', domingo: 'cerrado' });
  assert.deepEqual(agent.writeHours({ ...days, martes: '  ' }, extra), { nota: 'festivos cerrado', lunes: '10:00-22:00', domingo: 'cerrado' });
  assert.equal(agent.writeHours({}), null);
  assert.equal(agent.hoursTooLong({ lunes: 'x'.repeat(1000) }), true);
});
test('los selectores de estilo usan los valores del backend y la primera opción es Predeterminado', async () => {
  const view = await read('../src/components/customization/CustomizationView.astro');
  const backend = await read('../../Backend/src/modules/agent/domain/enums/agent-style.ts');
  for (const [id, enumName] of [['agent-tone', 'AgentTone'], ['agent-regional', 'AgentRegionalStyle']]) {
    const select = view.match(new RegExp(`<select id="${id}">(.*?)</select>`, 's'))[1];
    assert.match(select, /^<option value="">Predeterminado/);
    const options = [...select.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]).sort();
    const values = [...backend.match(new RegExp(`enum ${enumName} \\{(.*?)\\}`, 's'))[1].matchAll(/= '([^']+)'/g)].map(match => match[1]).sort();
    assert.deepEqual(options, values);
  }
  for (const id of ['agent-welcome', 'agent-unavailable']) assert.match(view, new RegExp(`id="${id}"[^>]*maxlength="500"`));
});

// 5. WhatsApp
test('vincular envía phoneNumberId y wabaId con un timeout de al menos 15 s', async () => {
  let options;
  globalThis.fetch = async (_url, init) => { options = init; return json({ id: 'c', status: 'FAILED', phoneNumber: null }, 200); };
  const result = await platform.connect('123456789012345', '987654321098765');
  assert.deepEqual(JSON.parse(options.body), { phoneNumberId: '123456789012345', wabaId: '987654321098765' });
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(result.status, 'FAILED');
  assert.match(await read('../src/services/platform.ts'), /AbortSignal\.timeout\((1[5-9]|[2-9]\d)\d{3}\)/);
});
test('GET /whatsapp/connections con cuerpo vacío se trata como sin conexión', async () => {
  globalThis.fetch = async () => new Response('', { status: 200 });
  assert.equal(await platform.connection(), null);
});
test('no quedan vistas de QR, chat simulado ni comprobación de estado contra Meta', async () => {
  const page = await read('../src/pages/vincular-whatsapp.astro');
  assert.doesNotMatch(page, /QrCard|ChatPreviewCard|FaqCard|RequirementsCard/);
  const card = await read('../src/components/vinculacionWpp/WhatsappConnectionCard.astro');
  for (const id of ['wa-simulated', 'wa-connected', 'wa-failed', 'wa-change', 'wa-replace-warning', 'wa-plan-notice']) assert.match(card, new RegExp(`id="${id}"`));
  assert.doesNotMatch(await read('../src/services/view-integration.ts'), /btn-check-status/);
});
