import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const js = ts.transpileModule(await read('../src/services/onboarding.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { accountHasPassword, pendingSteps, redirectFor, PASSWORD_STEP } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('una cuenta de Google sin contraseña no tiene contraseña aunque Supabase no lo diga', () => {
  assert.equal(accountHasPassword({ app_metadata: { providers: ['google'] } }), false);
});
test('la cuenta tiene contraseña con el proveedor email, con la marca password_set o sin lista de proveedores', () => {
  assert.equal(accountHasPassword({ app_metadata: { providers: ['email'] } }), true);
  assert.equal(accountHasPassword({ app_metadata: { providers: ['google', 'email'] } }), true);
  assert.equal(accountHasPassword({ app_metadata: { providers: ['google'], password_set: true } }), true);
  assert.equal(accountHasPassword({}), true);
});
test('el único paso del onboarding es crear la contraseña', () => {
  assert.deepEqual(pendingSteps(true), []);
  assert.deepEqual(pendingSteps(false), [PASSWORD_STEP]);
  assert.equal(PASSWORD_STEP.route, '/profile#password-form');
});
test('sin contraseña cualquier pantalla lleva a crearla; Perfil y Soporte no redirigen', () => {
  const pending = pendingSteps(false);
  assert.equal(redirectFor('/orders', pending), '/profile#password-form');
  assert.equal(redirectFor('/customization', pending), '/profile#password-form');
  assert.equal(redirectFor('/profile', pending), null);
  assert.equal(redirectFor('/support', pending), null);
  assert.equal(redirectFor('/orders', pendingSteps(true)), null);
});
test('el front usa la misma regla que el backend para saber si hay contraseña', async () => {
  const backend = await read('../../Backend/src/modules/auth/infrastructure/presentation/controllers/account.controller.ts');
  assert.match(backend, /providers\.includes\('email'\) \|\| user\.app_metadata\?\.password_set === true/);
  assert.match(backend, /updateUserById\(request\.user\.id, \{ app_metadata: \{ password_set: true \} \}\)/);
});
test('el onboarding ya no depende del checklist del negocio', async () => {
  for (const file of ['../src/services/onboarding.ts', '../src/services/onboarding-guard.ts']) assert.doesNotMatch(await read(file), /platform\.checklist|type Checklist|subscription\(/);
  const integration = await read('../src/services/view-integration.ts');
  assert.match(integration, /pendingSteps\(account\?\.hasPassword \?\? true\)[\s\S]*redirectFor\(path, pending\)[\s\S]*if \(run\) await run\(\)/);
});
test('el aviso de onboarding dice que la contraseña es el paso obligatorio y explica la redirección', async () => {
  const guard = await read('../src/services/onboarding-guard.ts');
  assert.match(guard, /Falta un paso obligatorio: crear tu contraseña/);
  assert.match(guard, /Tu nombre y los datos del negocio no completan este paso/);
  assert.match(guard, /Te trajimos aquí desde ' \+ \(SECTION_NAMES\[from\]/);
  assert.match(await read('../src/components/profile/PasswordCard.astro'), /Crear contraseña \(obligatorio\)/);
  const integration = await read('../src/services/view-integration.ts');
  assert.match(integration, /rememberRedirect\(path\); location\.replace\(target\)/);
  assert.match(integration, /Aún falta un paso obligatorio: crear tu contraseña/);
});
