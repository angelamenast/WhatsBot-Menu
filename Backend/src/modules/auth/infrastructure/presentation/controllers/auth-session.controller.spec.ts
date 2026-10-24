import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response, Request } from 'express';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from '../../../../../shared/supabase/supabase.service';
import { AuthSessionController } from './auth-session.controller';

describe('AuthSessionController', () => {
  const signInWithOAuth = jest.fn<(...args: any[]) => Promise<any>>();
  const controller = new AuthSessionController(
    { getClient: () => ({ auth: { signInWithOAuth } }) } as unknown as SupabaseService,
    new ConfigService({ FRONTEND_URL: 'https://tremia.example/' }),
  );

  beforeEach(() => jest.clearAllMocks());

  it('devuelve el usuario validado por el guard sin iniciar otra sesión', () => {
    const user = { id: 'user-1', email: 'user@example.com' } as User;
    expect(controller.getMe({ user } as Request & { user: User })).toEqual({ user });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('redirige a Google usando el callback del frontend configurado', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://supabase.example/oauth' }, error: null });
    const redirect = jest.fn();
    await controller.googleAuth({ redirect } as unknown as Response);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://tremia.example/auth/callback' },
    });
    expect(redirect).toHaveBeenCalledWith('https://supabase.example/oauth');
  });

  it('no redirige si Supabase falla o no devuelve URL', async () => {
    const redirect = jest.fn();
    for (const result of [
      { data: { url: null }, error: new Error('OAuth failed') },
      { data: { url: null }, error: null },
    ]) {
      signInWithOAuth.mockResolvedValue(result);
      await expect(controller.googleAuth({ redirect } as unknown as Response)).rejects.toThrow(BadRequestException);
    }
    expect(redirect).not.toHaveBeenCalled();
  });
});
