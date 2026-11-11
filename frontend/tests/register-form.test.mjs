import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/auth-forms.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { registerErrors, registerFailureMessage } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const valid = { nombre: 'Isabella', email: 'isa@empresa.com', telefono: '', password: 'secreta123', confirm: 'secreta123' };
const noErrors = { nombre: '', email: '', password: '', confirm: '' };

test('un registro completo no tiene errores y el teléfono es opcional', () => {
  assert.deepEqual(registerErrors(valid), noErrors);
  assert.deepEqual(registerErrors({ ...valid, telefono: '+57 300 000 0000' }), noErrors);
});
test('el nombre es obligatorio y no basta con espacios', () => {
  assert.equal(registerErrors({ ...valid, nombre: '' }).nombre, 'Escribe tu nombre.');
  assert.equal(registerErrors({ ...valid, nombre: '   ' }).nombre, 'Escribe tu nombre.');
});
test('el correo es obligatorio y debe ser válido', () => {
  assert.equal(registerErrors({ ...valid, email: '' }).email, 'Escribe tu correo electrónico.');
  assert.match(registerErrors({ ...valid, email: 'isa@empresa' }).email, /correo válido/);
  assert.match(registerErrors({ ...valid, email: 'isa empresa.com' }).email, /correo válido/);
  assert.equal(registerErrors({ ...valid, email: '  isa@empresa.com  ' }).email, '');
});
test('la contraseña necesita al menos 8 caracteres', () => {
  assert.equal(registerErrors({ ...valid, password: '', confirm: '' }).password, 'Escribe una contraseña.');
  assert.match(registerErrors({ ...valid, password: '1234567', confirm: '1234567' }).password, /al menos 8/);
  assert.equal(registerErrors({ ...valid, password: '12345678', confirm: '12345678' }).password, '');
});
test('la confirmación debe coincidir con la contraseña', () => {
  assert.equal(registerErrors({ ...valid, confirm: '' }).confirm, 'Confirma tu contraseña.');
  assert.equal(registerErrors({ ...valid, confirm: 'secreta124' }).confirm, 'Las contraseñas no coinciden.');
});
test('un correo ya registrado (409) muestra un mensaje claro', () => {
  const conflict = Object.assign(new Error('Ya existe una cuenta registrada con este correo'), { status: 409 });
  assert.match(registerFailureMessage(conflict), /Ya existe una cuenta con este correo.*Inicia sesión o continúa con Google/);
  assert.equal(registerFailureMessage(new Error('Sin conexión')), 'Sin conexión');
  assert.equal(registerFailureMessage(null), 'No se pudo crear la cuenta. Inténtalo de nuevo.');
});
