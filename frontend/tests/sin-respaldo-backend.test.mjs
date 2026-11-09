import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');

test('el pago no pide datos de tarjeta ni factura: se ingresan en Wompi', async () => {
  const form = await read('components/checkout/PaymentForm.astro');
  assert.doesNotMatch(form, /card_number|card_cvc|card_exp|card_name|RFC|<input/);
  assert.match(form, /id="card-form"/);
});

test('el perfil no pide datos que el backend no guarda', async () => {
  const profile = await read('components/profile/ProfileCard.astro');
  assert.doesNotMatch(profile, /admin-role|business-phone|avatar-upload|btn-change-avatar|CAFE-7749/);
  assert.doesNotMatch(await read('components/profile/SecurityCards.astro'), /2fa/i);
  assert.doesNotMatch(await read('components/profile/EmailCard.astro'), /otp/i);
  assert.doesNotMatch(await read('components/auth/LoginForm.astro'), /id="remember"/);
});

test('la integración no engancha elementos que ya no existen', async () => {
  const integration = await read('services/view-integration.ts');
  assert.doesNotMatch(integration, /toggle-2fa|btn-change-avatar|paypal-view|billing-invoices|billing-method|billing-tax|billing-usage|btn-create-bot|\/analytics|#card_/);
});
