import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AccountController } from './account.controller';
import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

describe('AccountController', () => {
  const controller = new AccountController(new ConfigService({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-key' }));
  const request = { user: { id: 'user-1', email: 'user@example.com' }, headers: { authorization: 'Bearer user-jwt' } } as unknown as Request & { user: User };
  afterEach(() => jest.restoreAllMocks());

  it('envía cambios con el JWT del usuario sin confirmar el correo administrativamente', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }));
    await controller.update(request, { nombre: 'Isabella', email: 'new@example.com' });
    expect(fetchMock).toHaveBeenCalledWith('https://test.supabase.co/auth/v1/user', expect.objectContaining({
      method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer user-jwt' }),
      body: JSON.stringify({ data: { nombre: 'Isabella', full_name: 'Isabella' }, email: 'new@example.com' }),
    }));
  });
  it('rechaza una contraseña nueva sin comprobar la contraseña actual', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(controller.update(request, { password: 'new-password' })).rejects.toThrow('contraseña actual');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  describe('contraseña según el proveedor de acceso', () => {
    const withProviders = (providers: string[]) => ({ ...request, user: { ...request.user, app_metadata: { providers } } }) as unknown as Request & { user: User };
    const session = { access_token: 'checked', refresh_token: 'r', expires_in: 3600, expires_at: 9999999999, token_type: 'bearer', user: { id: 'user-1', email: 'user@example.com' } };

    it('un usuario solo de Google crea su contraseña sin enviar la actual', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }));
      await controller.update(withProviders(['google']), { password: 'new-password' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('https://test.supabase.co/auth/v1/user', expect.objectContaining({
        method: 'PUT', body: JSON.stringify({ password: 'new-password' }),
      }));
    });
    it('un usuario con correo no puede cambiarla sin la contraseña actual', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch');
      await expect(controller.update(withProviders(['email', 'google']), { password: 'new-password' })).rejects.toThrow('contraseña actual');
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it('un usuario con correo cambia la contraseña si la actual es correcta', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
        const target = String(input instanceof Request ? input.url : input);
        if (target.includes('/auth/v1/token')) return new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
      });
      await controller.update(withProviders(['email']), { password: 'new-password', currentPassword: 'old-password' });
      const calls = fetchMock.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
      expect(calls.some(target => target.includes('/auth/v1/token?grant_type=password'))).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('https://test.supabase.co/auth/v1/user', expect.objectContaining({
        method: 'PUT', body: JSON.stringify({ password: 'new-password' }),
      }));
    });
  });
  it('no informa éxito si GoTrue rechaza la actualización', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 422 }));
    await expect(controller.update(request, { email: 'new@example.com' })).rejects.toThrow('No se pudo actualizar');
  });
});
