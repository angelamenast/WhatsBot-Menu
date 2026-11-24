import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const js = ts.transpileModule(await read('../src/services/account-messages.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { emailChangeNotice, emailChangeResult, loginFailureMessage } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('un cambio de correo sin confirmar queda pendiente y se sigue entrando con el actual', () => {
  assert.deepEqual(emailChangeResult('nuevo@ejemplo.test', { email: 'viejo@ejemplo.test', new_email: 'nuevo@ejemplo.test' }), { kind: 'pending', pending: 'nuevo@ejemplo.test' });
  // Sin new_email en la respuesta se usa el correo pedido.
  assert.deepEqual(emailChangeResult(' nuevo@ejemplo.test ', { email: 'viejo@ejemplo.test' }), { kind: 'pending', pending: 'nuevo@ejemplo.test' });
  const notice = emailChangeNotice('viejo@ejemplo.test', 'nuevo@ejemplo.test');
  assert.match(notice, /pendiente/);
  assert.match(notice, /confirmar nuevo@ejemplo\.test/);
  assert.match(notice, /sigue entrando con viejo@ejemplo\.test/);
});
test('si Supabase aplica el cambio de inmediato se informa el correo nuevo', () => {
  assert.deepEqual(emailChangeResult('Nuevo@Ejemplo.test', { email: 'nuevo@ejemplo.test' }), { kind: 'changed', email: 'nuevo@ejemplo.test' });
  assert.equal(emailChangeNotice('nuevo@ejemplo.test', null), '');
});
test('el error de credenciales recuerda que el correo nuevo necesita confirmación', () => {
  const rejected = Object.assign(new Error('Correo o contraseña incorrectos'), { status: 401 });
  assert.match(loginFailureMessage(rejected), /^Correo o contraseña incorrectos\. Si cambiaste tu correo hace poco/);
  assert.doesNotMatch(loginFailureMessage(Object.assign(new Error('Correo o contraseña incorrectos.'), { status: 401 })), /\.\./);
  const offline = Object.assign(new Error('No se pudo conectar con la API.'), { status: 0 });
  assert.equal(loginFailureMessage(offline), 'No se pudo conectar con la API.');
});
test('el perfil muestra el cambio de correo pendiente', async () => {
  assert.match(await read('../src/components/profile/EmailCard.astro'), /id="email-change-pending"[^>]*role="status"[^>]*hidden/);
  assert.match(await read('../src/services/view-integration.ts'), /showEmailChange\(user\.email, user\.new_email\)/);
});
