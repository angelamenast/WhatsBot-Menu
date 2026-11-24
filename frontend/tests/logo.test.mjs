import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('el logo es solo el símbolo y aparece en todos los layouts como icono', async () => {
  const logo = await read('../src/components/common/Logo.astro');
  assert.match(logo, /src="\/logo\.png"/);
  assert.doesNotMatch(logo, />\s*Tremia\s*</);
  for (const layout of ['Layout', 'BillingLayout', 'CheckoutLayout', 'OrdersLayout', 'ProfileLayout', 'VinculacionWppLayout']) {
    assert.match(await read(`../src/layouts/${layout}.astro`), /rel="icon" type="image\/png" href="\/logo\.png"/, layout);
  }
});
