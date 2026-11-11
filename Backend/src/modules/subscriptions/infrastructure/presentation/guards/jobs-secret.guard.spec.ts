import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsSecretGuard } from './jobs-secret.guard';

const SECRETO = 'secreto-largo-de-prueba';

function guardCon(secreto: string | undefined): JobsSecretGuard {
  return new JobsSecretGuard({ get: () => secreto } as unknown as ConfigService);
}

const contexto = (headers: Record<string, string | string[]>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

describe('JobsSecretGuard', () => {
  it('permite la llamada con el secreto correcto', () => {
    expect(guardCon(SECRETO).canActivate(contexto({ 'x-jobs-secret': SECRETO }))).toBe(true);
  });

  it.each([
    ['sin header', {}],
    ['secreto incorrecto', { 'x-jobs-secret': 'otro' }],
    ['secreto con un carácter de más', { 'x-jobs-secret': `${SECRETO}x` }],
    ['header repetido', { 'x-jobs-secret': [SECRETO, SECRETO] }],
  ])('responde 401 JOB_NO_AUTORIZADO: %s', (_caso, headers) => {
    const error = (() => {
      try {
        guardCon(SECRETO).canActivate(contexto(headers));
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ codigo: 'JOB_NO_AUTORIZADO' });
  });

  it('responde 503 JOBS_DESHABILITADOS si JOBS_SECRET no está configurado', () => {
    expect(() => guardCon(undefined).canActivate(contexto({ 'x-jobs-secret': '' }))).toThrow(
      ServiceUnavailableException,
    );
  });
});
