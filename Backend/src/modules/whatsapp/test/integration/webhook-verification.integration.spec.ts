import { VERIFY_TOKEN, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

describe('GET /api/whatsapp/webhook (verificación de Meta)', () => {
  let testApp: WhatsappTestApp;

  const valid = { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1158201444' };

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('modo subscribe + token correcto: 200 con el challenge en texto plano', async () => {
    const response = await testApp.getVerification(valid).expect(200);

    expect(response.text).toBe('1158201444');
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });

  it('no exige firma: la verificación es un GET sin X-Hub-Signature-256 y funciona igual', async () => {
    // getVerification nunca añade la cabecera de firma.
    await testApp.getVerification(valid).expect(200);
  });

  it('token incorrecto: 403 y el challenge no se devuelve', async () => {
    const response = await testApp.getVerification({ ...valid, 'hub.verify_token': 'otro-token' }).expect(403);

    expect(response.text).not.toContain('1158201444');
  });

  it('token con la misma longitud pero distinto contenido: 403', async () => {
    const sameLength = 'x'.repeat(VERIFY_TOKEN.length);

    await testApp.getVerification({ ...valid, 'hub.verify_token': sameLength }).expect(403);
  });

  it('token que solo es prefijo del correcto: 403', async () => {
    await testApp.getVerification({ ...valid, 'hub.verify_token': VERIFY_TOKEN.slice(0, -1) }).expect(403);
  });

  it.each([
    ['hub.mode distinto de subscribe', { ...valid, 'hub.mode': 'unsubscribe' }],
    ['sin hub.mode', { 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' }],
    ['sin hub.verify_token', { 'hub.mode': 'subscribe', 'hub.challenge': '1' }],
    ['sin hub.challenge', { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN }],
    ['hub.challenge vacío', { ...valid, 'hub.challenge': '' }],
    ['sin ningún parámetro', {}],
  ])('parámetros inválidos o ausentes (%s): 403', async (_label, query) => {
    await testApp.getVerification(query).expect(403);
  });

  it('sin WHATSAPP_VERIFY_TOKEN configurado: 403 siempre, aunque el token enviado esté vacío (falla cerrada)', async () => {
    testApp.env.WHATSAPP_VERIFY_TOKEN = undefined;

    await testApp.getVerification(valid).expect(403);
    await testApp.getVerification({ ...valid, 'hub.verify_token': '' }).expect(403);
  });

  it('el 403 no revela si falló el modo, el token o el challenge', async () => {
    const wrongMode = await testApp.getVerification({ ...valid, 'hub.mode': 'x' }).expect(403);
    const wrongToken = await testApp.getVerification({ ...valid, 'hub.verify_token': 'x' }).expect(403);

    expect(wrongMode.body).toEqual(wrongToken.body);
  });

  // Verificado: NO es un bug. El array llega al controller, pero secureCompare compara por longitud
  // de bytes y lo rechaza (meta-webhook.controller.ts:46, secure-compare.ts:5-8). Se deja como
  // prueba normal para fijar el comportamiento correcto.
  it('hub.verify_token repetido (llega como array) no verifica el webhook: 403', async () => {
    await testApp
      .getVerification({ ...valid, 'hub.verify_token': [VERIFY_TOKEN, 'otro'] })
      .expect(403);
  });

  it('hub.mode repetido o con notación de corchetes no verifica: 403', async () => {
    await testApp.getVerification({ ...valid, 'hub.mode': ['subscribe', 'otro'] }).expect(403);
    await testApp
      .getVerification({ 'hub.mode': 'subscribe', 'hub.verify_token[]': VERIFY_TOKEN, 'hub.challenge': '1' })
      .expect(403);
  });

  // BUG menor: hub.challenge se devuelve sin validar su tipo (meta-webhook.controller.ts:41,50). Con token
  // válido y el parámetro repetido, Express entrega un array y se responde '["1","2"]' como texto plano.
  // Meta siempre manda un único challenge numérico, así que el impacto es bajo (exige el token).
  it.failing('[BUG-CONOCIDO] hub.challenge repetido (array) debería rechazarse (403), no devolverse serializado', async () => {
    await testApp.getVerification({ ...valid, 'hub.challenge': ['1', '2'] }).expect(403);
  });
});
