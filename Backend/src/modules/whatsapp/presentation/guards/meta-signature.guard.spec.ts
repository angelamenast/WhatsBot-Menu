import 'reflect-metadata';
import { jest } from '@jest/globals';
import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MetaSignatureGuard } from './meta-signature.guard';

describe('MetaSignatureGuard', () => {
  const appSecret = 'app-secret-de-prueba';
  const rawBody = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const sign = (body: Buffer, secret = appSecret) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  const guardWith = (secret: string | undefined) =>
    new MetaSignatureGuard({ get: () => secret } as unknown as ConfigService);

  const contextFor = (request: { headers: Record<string, unknown>; rawBody?: Buffer }): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  it('firma válida: deja pasar', () => {
    const context = contextFor({ headers: { 'x-hub-signature-256': sign(rawBody) }, rawBody });

    expect(guardWith(appSecret).canActivate(context)).toBe(true);
  });

  it('firma inválida (otro secreto): rechaza con 401', () => {
    const context = contextFor({ headers: { 'x-hub-signature-256': sign(rawBody, 'otro') }, rawBody });

    expect(() => guardWith(appSecret).canActivate(context)).toThrow(UnauthorizedException);
  });

  it('cuerpo alterado tras firmar: rechaza', () => {
    const context = contextFor({
      headers: { 'x-hub-signature-256': sign(rawBody) },
      rawBody: Buffer.from('{"object":"otro"}'),
    });

    expect(() => guardWith(appSecret).canActivate(context)).toThrow(UnauthorizedException);
  });

  it.each([
    ['basura', 'no-es-una-firma'],
    ['sin prefijo sha256=', createHmac('sha256', appSecret).update(rawBody).digest('hex')],
    ['longitud distinta', 'sha256=abc'],
    ['vacía', ''],
  ])('firma mal formada (%s): rechaza', (_label, signature) => {
    const context = contextFor({ headers: { 'x-hub-signature-256': signature }, rawBody });

    expect(() => guardWith(appSecret).canActivate(context)).toThrow(UnauthorizedException);
  });

  it('firma ausente: rechaza', () => {
    const context = contextFor({ headers: {}, rawBody });

    expect(() => guardWith(appSecret).canActivate(context)).toThrow(UnauthorizedException);
  });

  it('sin secreto configurado (falla cerrada): rechaza incluso con una firma bien formada y loguea el motivo', () => {
    const context = contextFor({ headers: { 'x-hub-signature-256': sign(rawBody, '') }, rawBody });

    expect(() => guardWith(undefined).canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guardWith('').canActivate(context)).toThrow(UnauthorizedException);
    expect(String(errorSpy.mock.calls[0][0])).toContain('WHATSAPP_APP_SECRET');
  });

  it('sin cuerpo crudo disponible: rechaza', () => {
    const context = contextFor({ headers: { 'x-hub-signature-256': sign(rawBody) } });

    expect(() => guardWith(appSecret).canActivate(context)).toThrow(UnauthorizedException);
  });

  it('no registra el secreto ni la firma en los logs', () => {
    const signature = sign(rawBody, 'otro');
    const context = contextFor({ headers: { 'x-hub-signature-256': signature }, rawBody });

    expect(() => guardWith(undefined).canActivate(context)).toThrow();
    expect(() => guardWith(appSecret).canActivate(context)).toThrow();

    const logged = errorSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
    expect(logged).not.toContain(appSecret);
    expect(logged).not.toContain(signature);
  });
});
