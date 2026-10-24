import { jest } from '@jest/globals';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SupabaseService } from '../../../../../shared/supabase/supabase.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

describe('SupabaseAuthGuard',()=>{
  const getUser=jest.fn<(...args:any[])=>Promise<any>>();
  const guard=new SupabaseAuthGuard({getClient:()=>({auth:{getUser}})} as unknown as SupabaseService);
  const request:{headers:Record<string,string>;user?:unknown}={headers:{authorization:'Bearer test-token'}};
  const context={switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  beforeEach(()=>{getUser.mockReset();delete request.user;});
  it('solo acepta el usuario validado por Supabase',async()=>{
    getUser.mockResolvedValue({data:{user:{id:'google-user'}},error:null});
    expect(await guard.canActivate(context)).toBe(true);
    expect(getUser).toHaveBeenCalledWith('test-token');expect(request.user).toEqual({id:'google-user'});
  });
  it('no confunde un fallo de conexión con un token inválido',async()=>{
    for(const error of [{name:'AuthRetryableFetchError',status:0},{name:'AuthApiError',status:503}]){
      getUser.mockResolvedValue({data:{user:null},error});
      await expect(guard.canActivate(context)).rejects.toThrow(ServiceUnavailableException);
      expect(request.user).toBeUndefined();
    }
  });
  it('controla también fallos de red lanzados por el cliente',async()=>{
    getUser.mockRejectedValue(new TypeError('fetch failed'));
    await expect(guard.canActivate(context)).rejects.toThrow(ServiceUnavailableException);
  });
  it('rechaza tokens realmente inválidos sin abrir una sesión',async()=>{
    getUser.mockResolvedValue({data:{user:null},error:{name:'AuthApiError',status:403,code:'bad_jwt'}});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });
});
