import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/api/http.ts', import.meta.url), 'utf8');
globalThis.__testEnv = { PUBLIC_NEST_API_URL: 'http://localhost:3000/api/auth' };
const js = ts.transpileModule(source.replaceAll('import.meta.env', 'globalThis.__testEnv'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const httpUrl = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
const http = await import(httpUrl);
const serviceSource = await readFile(new URL('../src/services/platform.ts', import.meta.url), 'utf8');
const serviceJs = ts.transpileModule(serviceSource.replace("'../api/http'", JSON.stringify(httpUrl)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { platform } = await import('data:text/javascript;base64,' + Buffer.from(serviceJs).toString('base64'));
const authSource = await readFile(new URL('../src/services/auth.service.ts', import.meta.url), 'utf8');
const authJs = ts.transpileModule(authSource.replace("'../api/http'", JSON.stringify(httpUrl)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { authService } = await import('data:text/javascript;base64,' + Buffer.from(authJs).toString('base64'));
let values;
beforeEach(() => {
  values = new Map([['auth_token','expired'],['refresh_token','refresh-old']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  globalThis.document = { cookie: '' };
  globalThis.location = { protocol: 'https:', assign() {} };
  http.clearSession();
  values.set('auth_token','expired'); values.set('refresh_token','refresh-old');
  values.set('tremia_session_version','verified-v2');
  const sessionValues = new Map();
  globalThis.sessionStorage = { getItem: key => sessionValues.get(key) ?? null, setItem: (key,value) => sessionValues.set(key,value), removeItem: key => sessionValues.delete(key) };
});
const response = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});

test('normaliza la URL anterior /api/auth a la raíz /api', () => assert.equal(http.API_URL,'http://localhost:3000/api'));
test('renueva una sola vez dos solicitudes concurrentes y reintenta con el JWT nuevo', async () => {
  let refreshes = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++; await new Promise(resolve => setTimeout(resolve,15));
      assert.equal(JSON.parse(options.body).refresh_token,'refresh-old');
      return response({accessToken:'new',refreshToken:'refresh-new',expiresIn:3600});
    }
    return options.headers.get('Authorization') === 'Bearer new' ? response({ok:true}) : response({message:'Expired'},401);
  };
  assert.deepEqual(await Promise.all([http.request('/business/mine'),http.request('/orders')]),[{ok:true},{ok:true}]);
  assert.equal(refreshes,1);assert.equal(values.get('refresh_token'),'refresh-new');assert.match(document.cookie,/Secure/);
});
test('elimina la sesión cuando el refresh expiró',async()=>{
  globalThis.fetch=async()=>response({message:'Sesión expirada'},401);
  await assert.rejects(http.request('/orders'),error=>error.status===401);
  assert.equal(values.get('auth_token'),undefined);
});
test('muestra errores de validación y de conexión sin perder la sesión',async()=>{
  globalThis.fetch=async()=>response({message:['Nombre requerido','Teléfono requerido']},400);
  await assert.rejects(http.request('/business'),/Nombre requerido, Teléfono requerido/);
  globalThis.fetch=async()=>{throw new Error('network');};
  await assert.rejects(http.request('/orders'),/backend esté iniciado/);
  assert.equal(values.get('auth_token'),'expired');
});
test('checkout no envía importe ni negocioId y usa el contrato del backend',async()=>{
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'http://localhost:3000/api/payments/generate-link');assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{planId:'plan-id'});assert.equal(options.headers.get('Authorization'),'Bearer expired');
    return response({paymentUrl:'https://checkout.wompi.co/link',suscripcionId:'sub-id'});
  };
  assert.equal((await platform.checkout('plan-id')).suscripcionId,'sub-id');
});
test('lista planes sin sesión y codifica las referencias de renovación',async()=>{
  const urls=[];
  globalThis.fetch=async(url,options)=>{urls.push(url);if(url.endsWith('/plans'))assert.equal(options.headers.has('Authorization'),false);return response([]);};
  await platform.plans();await platform.renewal('link/a');
  assert.deepEqual(urls,['http://localhost:3000/api/payments/plans','http://localhost:3000/api/subscriptions/renewal/link%2Fa']);
});

test('un correo inexistente no conserva ni abre la sesión anterior', async () => {
  values.set('user_profile_data', JSON.stringify({email:'old@example.com'}));
  values.set('renewal_reference','old-account-payment');
  globalThis.fetch=async()=>response({message:'Correo o contraseña incorrectos'},401);
  await assert.rejects(authService.login({email:'missing@example.com',password:'wrong-pass'}), /Correo o contraseña incorrectos/);
  assert.equal(values.get('auth_token'),undefined);assert.equal(values.get('refresh_token'),undefined);
  assert.equal(values.get('user_profile_data'),undefined);assert.equal(values.get('renewal_reference'),undefined);
});
test('rechaza un token si pertenece a otro correo aunque el login devuelva 200', async () => {
  globalThis.fetch=async url=>url.endsWith('/auth/login') ? response({accessToken:'other-token',refreshToken:'other-refresh',expiresIn:3600}) : response({user:{id:'old-user',email:'old@example.com'}});
  await assert.rejects(authService.login({email:'new@example.com',password:'password123'}),/verificar la cuenta/);
  assert.equal(values.get('auth_token'),undefined);
});
test('solo guarda la sesión del correo validado por la API', async () => {
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/auth/login')) return response({accessToken:'new-user-token',refreshToken:'new-user-refresh',expiresIn:3600});
    assert.equal(options.headers.get('Authorization'),'Bearer new-user-token');
    return response({user:{id:'new-user',email:'new@example.com'}});
  };
  await authService.login({email:'NEW@example.com',password:'password123'});
  assert.equal(values.get('auth_token'),'new-user-token');assert.equal(values.get('refresh_token'),'new-user-refresh');
});
test('un callback de Google sin tokens nunca reutiliza los de otro usuario', async () => {
  sessionStorage.setItem('oauth_pending','true');
  globalThis.fetch=async()=>{throw new Error('No debería consultar la sesión vieja');};
  await assert.rejects(authService.completeGoogleCallback(''),/completar el acceso con Google/);
  assert.equal(values.get('auth_token'),undefined);assert.equal(values.get('refresh_token'),undefined);
});
test('el callback valida los tokens nuevos de Google antes de abrir la cuenta', async () => {
  sessionStorage.setItem('oauth_pending','true');
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push(url);
    assert.equal(options.headers.get('Authorization'),'Bearer google-new');
    if(url.endsWith('/auth/bootstrap')) assert.deepEqual(JSON.parse(options.body),{createProfile:false});
    return response(url.endsWith('/auth/me')?{user:{id:'google-user',email:'chosen@example.com'}}:{ready:true});
  };
  const user=await authService.completeGoogleCallback('#access_token=google-new&refresh_token=google-refresh&expires_in=3600');
  assert.equal(user.email,'chosen@example.com');assert.equal(values.get('auth_token'),'google-new');assert.equal(calls.length,2);
});
test('Google rechaza una cuenta sin registro y deja el navegador sin sesión', async () => {
  sessionStorage.setItem('oauth_pending','true');
  globalThis.fetch=async url=>response(url.endsWith('/auth/me')?{user:{id:'unregistered',email:'new@example.com'}}:{message:'Esta cuenta no está registrada en Tremia. Regístrate primero.'},url.endsWith('/auth/me')?200:403);
  await assert.rejects(authService.completeGoogleCallback('#access_token=google-new&refresh_token=google-refresh&expires_in=3600'),/no está registrada/);
  assert.equal(values.get('auth_token'),undefined);assert.equal(values.get('user_profile_data'),undefined);
});
test('solo el flujo de registro de Google solicita crear un perfil nuevo',async()=>{
  sessionStorage.setItem('oauth_pending','true');sessionStorage.setItem('oauth_intent','register');
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/auth/bootstrap')) assert.deepEqual(JSON.parse(options.body),{createProfile:true});
    return response(url.endsWith('/auth/me')?{user:{id:'new',email:'new@example.com'}}:{ready:true});
  };
  await authService.completeGoogleCallback('#access_token=google-new&refresh_token=google-refresh&expires_in=3600');
  assert.equal(values.get('auth_token'),'google-new');
});
test('un refresh antiguo no puede reemplazar una sesión nueva', async () => {
  let releaseRefresh;
  globalThis.fetch=async url=>url.endsWith('/auth/refresh')?new Promise(resolve=>{releaseRefresh=resolve;}):response({message:'Expired'},401);
  const pending=http.request('/orders');
  const rejected=assert.rejects(pending,error=>error.status===409);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof releaseRefresh,'function');
  http.saveSession({accessToken:'other-account',refreshToken:'other-refresh',expiresIn:3600});
  releaseRefresh(response({accessToken:'stale-token',refreshToken:'stale-refresh',expiresIn:3600}));
  await rejected;assert.equal(values.get('auth_token'),'other-account');assert.equal(values.get('refresh_token'),'other-refresh');
});
test('una respuesta privada anterior no se muestra después de cambiar de cuenta',async()=>{
  let release;
  globalThis.fetch=()=>new Promise(resolve=>{release=resolve;});
  const pending=http.request('/auth/me');const rejected=assert.rejects(pending,error=>error.status===409);
  http.saveSession({accessToken:'other-account',refreshToken:'other-refresh',expiresIn:3600});
  release(response({user:{email:'old@example.com'}}));await rejected;
  assert.equal(values.get('auth_token'),'other-account');
});

test('las sesiones guardadas antes de la corrección obligan a identificar la cuenta de nuevo',async()=>{
  values.delete('tremia_session_version');values.set('user_profile_data',JSON.stringify({email:'old@example.com'}));
  globalThis.fetch=async()=>{throw new Error('No debe enviar el token de la versión anterior');};
  await assert.rejects(http.request('/auth/me'),error=>error.status===401);
  assert.equal(values.get('auth_token'),undefined);assert.equal(values.get('user_profile_data'),undefined);
});
