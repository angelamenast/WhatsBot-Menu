import { BadRequestException } from '@nestjs/common';
import { WompiPaymentGatewayAdapter } from '../../../src/modules/payments/infrastructure/adapters/wompi-payment-gateway.adapter';
import type { WebhookPagoPayload } from '../../../src/modules/payments/domain/repositories/application/ports/out/payment-gateway.port';
import { closedConfig } from '../support/test-app';
import { buildWompiEvent } from '../support/wompi-events';
import { describeWithWompi } from '../support/wompi-env';

const { env, describe: describeWompi } = describeWithWompi();

describeWompi('Wompi sandbox: WompiPaymentGatewayAdapter', () => {
  const wompi = env;
  const adapterCon = (overrides: Record<string, string> = {}) =>
    new WompiPaymentGatewayAdapter(
      closedConfig({
        WOMPI_BASE_URL: wompi.baseUrl,
        WOMPI_PRIVATE_KEY: wompi.privateKey,
        WOMPI_EVENTS_SECRET: wompi.eventsSecret,
        ...overrides,
      }),
    );
  const adapter = adapterCon();

  // Mismo armado que el controller del webhook.
  const comoPayload = (evento: ReturnType<typeof buildWompiEvent> | Record<string, unknown>): WebhookPagoPayload => {
    const e = evento as ReturnType<typeof buildWompiEvent>;
    return {
      referencia: e.data?.transaction?.reference,
      estado: e.data?.transaction?.status as WebhookPagoPayload['estado'],
      firmaRecibida: e.signature?.checksum,
      crudo: evento,
    };
  };

  it('IT-WOMPI-01 crearLinkPago crea un link real en el sandbox (single_use, COP, monto)', async () => {
    const montoEnCentavos = 1_500_000;

    const link = await adapter.crearLinkPago({
      montoEnCentavos,
      descripcion: `it_ prueba de integración ${new Date().toISOString()}`,
      redirectUrl: 'http://localhost:4321/billing',
    });

    console.log(`[IT-WOMPI-01] id del link creado en Wompi sandbox: ${link.id}`);
    expect(link.id).toEqual(expect.any(String));
    expect(link.url).toBe(`https://checkout.wompi.co/l/${link.id}`);

    const response = await fetch(`${wompi.baseUrl}/payment_links/${link.id}`, {
      headers: { Authorization: `Bearer ${wompi.privateKey}` },
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { id: string; amount_in_cents: number; currency: string; single_use: boolean };
    };
    expect(data).toMatchObject({ id: link.id, amount_in_cents: montoEnCentavos, currency: 'COP', single_use: true });
  });

  it('IT-WOMPI-02 con una llave privada inválida lanza BadRequestException (error controlado)', async () => {
    const invalido = adapterCon({ WOMPI_PRIVATE_KEY: 'prv_test_llaveInvalidaDePruebas000000' });

    await expect(
      invalido.crearLinkPago({ montoEnCentavos: 1_500_000, descripcion: 'it_ llave inválida', redirectUrl: 'http://localhost:4321/billing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('IT-WOMPI-03 firma del webhook (SHA-256 de signature.properties + timestamp + secret)', () => {
    const evento = () =>
      buildWompiEvent({ paymentLinkId: 'it_link', status: 'APPROVED', amountInCents: 1_500_000, secret: wompi.eventsSecret });

    it('IT-WOMPI-03a evento bien firmado → true', () => {
      expect(adapter.verificarFirmaWebhook(comoPayload(evento()))).toBe(true);
    });

    it('IT-WOMPI-03b amount_in_cents alterado después de firmar → false', () => {
      const alterado = evento();
      alterado.data.transaction.amount_in_cents = 100;
      expect(adapter.verificarFirmaWebhook(comoPayload(alterado))).toBe(false);
    });

    it('IT-WOMPI-03c firmado con otro secret → false', () => {
      const otro = buildWompiEvent({
        paymentLinkId: 'it_link',
        status: 'APPROVED',
        amountInCents: 1_500_000,
        secret: 'test_events_otroSecretQueNoEsElNuestro',
      });
      expect(adapter.verificarFirmaWebhook(comoPayload(otro))).toBe(false);
    });

    it('IT-WOMPI-03d sin signature → false', () => {
      const { signature: _omitida, ...sinFirma } = evento();
      expect(adapter.verificarFirmaWebhook(comoPayload(sinFirma))).toBe(false);
    });
  });
});
