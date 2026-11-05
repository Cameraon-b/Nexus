import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, WorkspaceApi } from './live-api';
afterEach(() => vi.unstubAllGlobals());
it.each(['bootstrap','login','register'] as const)('%s remains successful when identity CSRF refresh fails, and the next POST reacquires it', async mode => {
 const calls: {url:string; init?:RequestInit}[]=[];
 let tokens=0;
 vi.stubGlobal('fetch', async (url:string, init?:RequestInit) => {
  calls.push({url,init});
  if(url.endsWith('/csrf')) {
   tokens++;
   if(tokens===2)throw new TypeError('Network interrupted after authentication');
   return Response.json({token:`token-${tokens}`});
  }
  return Response.json({id:'user'});
 });
 const api=new WorkspaceApi();
 await expect(api.authenticate(mode,{})).resolves.toBeUndefined();
 await api.post('/conversations/main/messages',{body:'Hello'});
 expect(calls.map(call=>call.url)).toEqual(['/api/auth/csrf',`/api/auth/${mode}`,'/api/auth/csrf','/api/auth/csrf','/api/conversations/main/messages']);
 expect(new Headers(calls.at(-1)?.init?.headers).get('X-CSRF-TOKEN')).toBe('token-3');
});
it.each(['bootstrap','login','register'] as const)('%s still reports failure of the authentication POST', async mode => {
 vi.stubGlobal('fetch',async (url:string)=>url.endsWith('/csrf')?Response.json({token:'anonymous'}):Response.json({title:'Authentication rejected'},{status:400}));
 await expect(new WorkspaceApi().authenticate(mode,{})).rejects.toMatchObject({status:400,message:'Authentication rejected'});
});
it('rejects HTTP failures with status and safe validation details, handles empty logout', async () => {
 const api = new WorkspaceApi();
 vi.stubGlobal('fetch', async () => Response.json({title:'Sign in required'}, {status:401}));
 await expect(api.get('/auth/me')).rejects.toMatchObject({status:401, message:'Sign in required'});
 vi.stubGlobal('fetch', async () => Response.json({title:'Invalid input',errors:{Email:['Enter a valid email.']}}, {status:400}));
 await expect(api.get('/test')).rejects.toBeInstanceOf(ApiError);
 await expect(api.get('/test')).rejects.toMatchObject({fields:{email:['Enter a valid email.']}});
 vi.stubGlobal('fetch', async (url: string) => url.endsWith('/csrf') ? Response.json({token:'test'}) : new Response(null,{status:204}));
 await expect(api.post('/auth/logout')).resolves.toBeUndefined();
 vi.stubGlobal('fetch', async () => new Response('<html>proxy down</html>', {status:502}));
 await expect(api.get('/auth/status')).rejects.toMatchObject({status:502,message:'The local server is unavailable. Please retry.'});
});
it('never posts without a valid CSRF token', async () => {
 const calls:string[]=[];
 vi.stubGlobal('fetch', async (url:string) => {calls.push(url);return Response.json({});});
 const api=new WorkspaceApi();
 await expect(api.post('/auth/login',{})).rejects.toThrow('security token');
 expect(calls).toEqual(['/api/auth/csrf']);
});
it('sends cookie credentials and CSRF on unsafe requests, refreshing after identity changes', async () => {
 const calls: {url: string; init?: RequestInit}[] = [];
 let token = 0;
 vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
  calls.push({url, init});
  return Response.json(url.endsWith('/csrf') ? {token: `token-${++token}`} : {id:'user'});
 });
 const api = new WorkspaceApi();
 await api.authenticate('login', {email:'fixture@example.test', password:'fixture-only-password'});
 await api.post('/conversations/main/messages', {body:'Hello',clientRequestId:'id'});
 expect(calls.map(c => c.url)).toEqual(['/api/auth/csrf','/api/auth/login','/api/auth/csrf','/api/conversations/main/messages']);
 expect(calls.every(c => c.init?.credentials === 'same-origin')).toBe(true);
 expect(new Headers(calls[1].init?.headers).get('X-CSRF-TOKEN')).toBe('token-1');
 expect(new Headers(calls[3].init?.headers).get('X-CSRF-TOKEN')).toBe('token-2');
});
it('registers with the exact account fields and refreshes CSRF for the authenticated session', async () => {
 const calls: {url:string; init?:RequestInit}[]=[];
 let token=0;
 vi.stubGlobal('fetch',async (url:string,init?:RequestInit)=>{
  calls.push({url,init});
  return url.endsWith('/csrf')?Response.json({token:`token-${++token}`}):Response.json({id:'new-user'});
 });
 await new WorkspaceApi().authenticate('register',{displayName:'New Human',email:'new@example.test',password:'twelve-chars!'});
 expect(calls.map(call=>call.url)).toEqual(['/api/auth/csrf','/api/auth/register','/api/auth/csrf']);
 expect(calls[1].init?.method).toBe('POST');
 expect(JSON.parse(String(calls[1].init?.body))).toEqual({displayName:'New Human',email:'new@example.test',password:'twelve-chars!'});
 expect(new Headers(calls[1].init?.headers).get('X-CSRF-TOKEN')).toBe('token-1');
});
