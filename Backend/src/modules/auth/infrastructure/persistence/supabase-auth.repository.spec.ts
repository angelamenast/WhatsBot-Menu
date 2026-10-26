import { jest } from '@jest/globals';
import { SupabaseAuthRepository } from './supabase-auth.repository';
import type { SupabaseService } from '../../../../shared/supabase/supabase.service';

describe('SupabaseAuthRepository: aislamiento de cuentas', () => {
  const createAuthClient = jest.fn<(...args: any[]) => any>();
  const getClient = jest.fn(() => { throw new Error('No debe reutilizar el cliente compartido para login o refresh'); });
  const repository = new SupabaseAuthRepository({ createAuthClient, getClient } as unknown as SupabaseService);
  beforeEach(() => jest.clearAllMocks());
  const session = (name: string) => ({ access_token: name, refresh_token: name + '-refresh', expires_in: 3600 });

  it('un usuario inexistente no devuelve la sesión previa aunque Supabase incluya datos', async () => {
    createAuthClient.mockReturnValue({ auth: { signInWithPassword: async () => ({ data: { session: session('old'), user: {email:'old@example.com'} }, error: {message:'invalid credentials'} }) } });
    await expect(repository.login('missing@example.com','wrong-password')).rejects.toThrow();
    expect(getClient).not.toHaveBeenCalled();
  });
  it('rechaza datos sin sesión o con un correo distinto al solicitado', async () => {
    for (const data of [{session:null,user:null},{session:session('other'),user:{email:'other@example.com'}}]) {
      createAuthClient.mockReturnValue({ auth: { signInWithPassword: async () => ({data,error:null}) } });
      await expect(repository.login('requested@example.com','password123')).rejects.toThrow();
    }
  });
  it('usa un cliente nuevo para cada acceso concurrente', async () => {
    const clients: object[] = [];
    createAuthClient.mockImplementation(() => {
      const client = { auth: { signInWithPassword: async ({email}: {email:string}) => ({ data: {session:session(email),user:{email}},error:null }) } };
      clients.push(client);return client;
    });
    const results = await Promise.all([repository.login('first@example.com','password123'),repository.login('second@example.com','password123')]);
    expect(results.map(result=>result.accessToken)).toEqual(['first@example.com','second@example.com']);
    expect(clients[0]).not.toBe(clients[1]);expect(getClient).not.toHaveBeenCalled();
  });
  it('renueva una sesión con un cliente aislado', async () => {
    const refreshSession = jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({data:{session:session('renewed')},error:null});
    createAuthClient.mockReturnValue({auth:{refreshSession}});
    expect((await repository.refresh('own-refresh')).accessToken).toBe('renewed');
    expect(refreshSession).toHaveBeenCalledWith({refresh_token:'own-refresh'});expect(getClient).not.toHaveBeenCalled();
  });
});
