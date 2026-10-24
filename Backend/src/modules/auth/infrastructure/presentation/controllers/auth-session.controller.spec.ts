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
      options: { redirectTo: 'https://tremia.example/auth/callback', queryParams: { prompt: 'select_account' } },
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

  it('no convierte el inicio de sesión con Google de una cuenta desconocida en registro', async () => {
    const upsert = jest.fn();
    const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({data:null,error:null}), upsert };
    const subject = new AuthSessionController({getClient:()=>({from:()=>query})} as unknown as SupabaseService, new ConfigService());
    await expect(subject.bootstrap({user:{id:'new-user'}} as Request & {user:User}, {createProfile:false})).rejects.toThrow('no está registrada');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('permite entrar con Google a una cuenta registrada sin modificar su perfil', async () => {
    const upsert = jest.fn();
    const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({data:{id:'existing'},error:null}), upsert };
    const subject = new AuthSessionController({getClient:()=>({from:()=>query})} as unknown as SupabaseService, new ConfigService());
    expect(await subject.bootstrap({user:{id:'existing'}} as Request & {user:User}, {createProfile:false})).toEqual({ready:true});
    expect(upsert).not.toHaveBeenCalled();
  });

  it('crea el perfil cuando el usuario viene de Registrarse', async () => {
    const upsert = jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({error:null});
    const subject = new AuthSessionController({getClient:()=>({from:()=>({upsert})})} as unknown as SupabaseService, new ConfigService());
    await subject.bootstrap({user:{id:'new-user',email:'new@example.com',user_metadata:{nombre:'Isabella'}}} as Request & {user:User}, {createProfile:true});
    expect(upsert).toHaveBeenCalledWith({id:'new-user',nombre:'Isabella'},{onConflict:'id',ignoreDuplicates:true});
  });
});

describe('Google URL para el formulario', () => {
 it('devuelve la URL sin redirigir para detectar fallos antes de abandonar la vista',async()=>{
   const controller=new AuthSessionController({getClient:()=>({auth:{signInWithOAuth:async()=>({data:{url:'https://supabase.example/oauth'},error:null})}})} as unknown as SupabaseService,new ConfigService());
   expect(await controller.googleUrl()).toEqual({url:'https://supabase.example/oauth'});
 });
});
