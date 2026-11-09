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
globalThis.__testEnv = { PUBLIC_API_URL: 'http://localhost:3000/api' };
const http = await load('../src/api/http.ts', text => text.replaceAll('import.meta.env', 'globalThis.__testEnv'));
const { module: { platform } } = await load('../src/services/platform.ts', text => text.replace("'../api/http'", JSON.stringify(http.url)));
const { module: { attentionStateText, CHECKLIST_LINKS, missingSteps } } = await load('../src/services/setup-checklist.ts');

beforeEach(() => {
  const values = new Map([['auth_token', 'token'], ['refresh_token', 'refresh'], ['tremia_session_version', 'verified-v2']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.document = { cookie: '' };
  globalThis.location = { protocol: 'http:' };
});
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const faltantes = [{ clave: 'whatsapp_conectado', label: 'WhatsApp vinculado' }, { clave: 'catalogo', label: 'Al menos 1 producto en el catálogo' }];

test('el checklist se pide con la sesión al endpoint del backend', async () => {
  const checklist = { items: [{ clave: 'plan_activo', completo: true, label: 'Plan activo' }], completo: true, porcentaje: 100 };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:3000/api/negocios/me/checklist');
    assert.equal(options.method, undefined);
    assert.equal(options.headers.get('Authorization'), 'Bearer token');
    return response(checklist);
  };
  assert.deepEqual(await platform.checklist(), checklist);
});

for (const activa of [true, false]) test(`cambiar la atención a ${activa} envía solo "activa" por PATCH`, async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:3000/api/negocios/me/atencion-automatica');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { activa });
    return response({ atencionAutomaticaActiva: activa });
  };
  assert.deepEqual(await platform.setAutoAttention(activa), { atencionAutomaticaActiva: activa });
});

test('un 409 del backend conserva el mensaje y los faltantes para mostrarlos', async () => {
  const message = 'Completa la configuración del negocio antes de activar la atención automática';
  globalThis.fetch = async () => response({ statusCode: 409, error: 'Conflict', message, faltantes }, 409);
  const error = await platform.setAutoAttention(true).catch(failure => failure);
  assert.equal(error.status, 409);
  assert.equal(error.message, message);
  assert.deepEqual(missingSteps(error), faltantes);
});

test('solo un 409 con faltantes bien formados se muestra como pasos pendientes', () => {
  assert.deepEqual(missingSteps(new http.module.ApiError(409, 'La sesión cambió. Vuelve a cargar esta página.')), []);
  assert.deepEqual(missingSteps(new http.module.ApiError(500, 'Error', { faltantes })), []);
  assert.deepEqual(missingSteps(new http.module.ApiError(409, 'x', { faltantes: 'catalogo' })), []);
  assert.deepEqual(missingSteps(new http.module.ApiError(409, 'x', { faltantes: [null, { clave: 'catalogo' }, faltantes[0]] })), [faltantes[0]]);
  assert.deepEqual(missingSteps(new Error('network')), []);
  assert.deepEqual(missingSteps(null), []);
});

test('sin un valor leído de la API el interruptor no afirma que esté encendida ni apagada', () => {
  assert.match(attentionStateText(null), /sin confirmar/);
  assert.match(attentionStateText(true), /^Encendida/);
  assert.match(attentionStateText(false), /^Apagada/);
});

test('cada paso del checklist del backend tiene un enlace para completarlo', async () => {
  const backend = await readFile(new URL('../../Backend/src/modules/negocio-setup/domain/checklist-negocio.ts', import.meta.url), 'utf8');
  const claves = [...backend.match(/const LABELS[^{]*\{(.*?)\};/s)[1].matchAll(/^\s*(\w+):/gm)].map(match => match[1]);
  assert.equal(claves.length, 4);
  assert.deepEqual(Object.keys(CHECKLIST_LINKS).sort(), claves.sort());
});

test('los enlaces internos del checklist apuntan a secciones de la vista', async () => {
  const view = await readFile(new URL('../src/components/customization/CustomizationView.astro', import.meta.url), 'utf8');
  for (const { href } of Object.values(CHECKLIST_LINKS).filter(({ href }) => href.startsWith('#'))) assert.match(view, new RegExp(`id="${href.slice(1)}"`));
  for (const id of ['setup-steps', 'attention-switch', 'attention-off', 'attention-state', 'attention-feedback', 'attention-missing', 'checklist-feedback']) assert.match(view, new RegExp(`id="${id}"`));
});
