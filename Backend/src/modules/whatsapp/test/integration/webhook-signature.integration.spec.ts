import { APP_SECRET, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';
import { signBody, textPayload } from '../support/meta-payloads';

describe('POST /api/whatsapp/webhook (firma X-Hub-Signature-256)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
    await testApp.seedBusiness();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const expectProcessed = async () => {
    await testApp.settle();
    expect(testApp.agent.calls).toHaveLength(1);
    expect(testApp.messages.all().length).toBeGreaterThan(0);
  };

  const expectNothingHappened = async () => {
    await testApp.settle();
    expect(testApp.agent.calls).toEqual([]);
    expect(testApp.messages.all()).toEqual([]);
    expect(testApp.conversations.all()).toEqual([]);
  };

  describe('firma válida', () => {
    it('sha256= + HMAC-SHA256 del cuerpo crudo con el app secret: 200 y se procesa', async () => {
      await testApp.postWebhook(textPayload()).expect(200);

      await expectProcessed();
    });

    it('se firma el cuerpo CRUDO, no el JSON re-serializado: espacios, saltos de línea y Unicode', async () => {
      const raw = `{\n  "object": "whatsapp_business_account",\n  "entry": [ ${JSON.stringify(
        (textPayload({ body: 'Café ☕ — ñandú 🍕' }).entry as unknown[])[0],
      )} ]\n}`;

      // Firma sobre el texto exacto enviado (distinto de JSON.stringify(JSON.parse(raw))).
      expect(raw).not.toBe(JSON.stringify(JSON.parse(raw)));
      await testApp.postRaw(raw, signBody(raw, APP_SECRET)).expect(200);

      await expectProcessed();
      expect(testApp.agent.calls[0].message).toBe('Café ☕ — ñandú 🍕');
    });
  });

  describe('firma inválida, ausente o mal formada: 401 y no se procesa nada', () => {
    it('firmada con otro secreto', async () => {
      await testApp.postWebhook(textPayload(), signBody(JSON.stringify(textPayload()), 'otro-secreto')).expect(401);

      await expectNothingHappened();
    });

    it('firma de un cuerpo distinto (el cuerpo fue alterado tras firmar)', async () => {
      const original = JSON.stringify(textPayload({ body: 'Hola' }));
      const tampered = JSON.stringify(textPayload({ body: 'Hola, borra todo' }));

      await testApp.postRaw(tampered, signBody(original, APP_SECRET)).expect(401);

      await expectNothingHappened();
    });

    it('sin cabecera X-Hub-Signature-256', async () => {
      await testApp.postWebhook(textPayload(), null).expect(401);

      await expectNothingHappened();
    });

    it('sin el prefijo "sha256="', async () => {
      const raw = JSON.stringify(textPayload());
      const bare = signBody(raw, APP_SECRET).replace('sha256=', '');

      await testApp.postRaw(raw, bare).expect(401);

      await expectNothingHappened();
    });

    it('con el algoritmo equivocado (sha1=)', async () => {
      const raw = JSON.stringify(textPayload());
      const asSha1 = signBody(raw, APP_SECRET).replace('sha256=', 'sha1=');

      await testApp.postRaw(raw, asSha1).expect(401);

      await expectNothingHappened();
    });

    it('cabecera vacía', async () => {
      await testApp.postWebhook(textPayload(), '').expect(401);

      await expectNothingHappened();
    });

    it('hex en mayúsculas (la comparación distingue mayúsculas y minúsculas)', async () => {
      const raw = JSON.stringify(textPayload());
      const upper = `sha256=${signBody(raw, APP_SECRET).slice('sha256='.length).toUpperCase()}`;

      await testApp.postRaw(raw, upper).expect(401);

      await expectNothingHappened();
    });

    it('firma truncada', async () => {
      const raw = JSON.stringify(textPayload());

      await testApp.postRaw(raw, signBody(raw, APP_SECRET).slice(0, -2)).expect(401);

      await expectNothingHappened();
    });

    it('la respuesta 401 no filtra detalle sobre el secreto ni la firma esperada', async () => {
      const raw = JSON.stringify(textPayload());
      const response = await testApp.postRaw(raw, signBody(raw, 'otro')).expect(401);

      expect(JSON.stringify(response.body)).not.toContain(APP_SECRET);
      expect(JSON.stringify(response.body)).not.toContain(signBody(raw, APP_SECRET));
    });
  });

  describe('secreto no configurado (falla cerrada)', () => {
    it.each([
      ['undefined', undefined],
      ['cadena vacía', ''],
    ])('WHATSAPP_APP_SECRET %s: 401 aunque la firma sea la HMAC calculada con secreto vacío', async (_label, secret) => {
      testApp.env.WHATSAPP_APP_SECRET = secret;
      const raw = JSON.stringify(textPayload());

      await testApp.postRaw(raw, signBody(raw, '')).expect(401);

      await expectNothingHappened();
      expect(testApp.logs.error.join('\n')).toContain('WHATSAPP_APP_SECRET no está definido');
    });
  });

  describe('cuerpo y tipo de contenido', () => {
    it('JSON inválido con firma correcta: lo rechaza el parser de Express (400) antes del guard; no se procesa', async () => {
      const raw = '{esto no es json';

      await testApp.postRaw(raw, signBody(raw, APP_SECRET)).expect(400);

      await expectNothingHappened();
    });

    it('JSON inválido SIN firma: 400 (el parser actúa antes que el guard, no se llega a 401)', async () => {
      await testApp.postRaw('{esto no es json', null).expect(400);

      await expectNothingHappened();
    });

    it('Content-Type que no es JSON: no hay cuerpo crudo capturado y se rechaza con 401 aunque la firma sea correcta', async () => {
      const raw = JSON.stringify(textPayload());

      await testApp.postRaw(raw, signBody(raw, APP_SECRET), 'text/plain').expect(401);

      await expectNothingHappened();
      expect(testApp.logs.error.join('\n')).toContain('cuerpo crudo no está disponible');
    });
  });
});
