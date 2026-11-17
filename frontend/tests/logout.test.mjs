import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('hay botón de cerrar sesión en el menú lateral y en la barra superior', async () => {
  assert.match(await read('../src/components/common/Sidebar.astro'), /data-logout[\s\S]*Cerrar sesión/);
  assert.match(await read('../src/components/common/Navbar.astro'), /data-logout[\s\S]*aria-label="Cerrar sesión"/);
  const guard = await read('../src/components/common/SessionGuard.astro');
  assert.match(guard, /\[data-logout\][\s\S]*\/auth\/logout[\s\S]*clearSession\(\);\s*location\.replace\('\/auth\/login'\)/);
});
