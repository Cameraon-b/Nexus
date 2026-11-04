export class ApiError extends Error {
 constructor(public status: number, message: string, public fields: Record<string,string[]> = {}) { super(message); }
}
async function decode<T>(response: Response): Promise<T> {
 if (response.status === 204) return undefined as T;
 const data = await response.json().catch(() => null);
 if (!response.ok) {
  const fields: Record<string,string[]> = {};
  for (const [key,value] of Object.entries(data?.errors ?? {})) {
   if (Array.isArray(value)) fields[key.charAt(0).toLowerCase()+key.slice(1)] = value.filter((v): v is string => typeof v === 'string');
  }
  throw new ApiError(response.status, response.status >= 500 ? 'The local server is unavailable. Please retry.' : data?.detail ?? data?.title ?? data?.message ?? 'The request could not be completed.', fields);
 }
 if (data === null) throw new ApiError(response.status, 'The local server returned an unexpected response. Please retry.');
 return data as T;
}
export class WorkspaceApi {
 private token: string | undefined;
 async get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {credentials:'same-origin', signal});
  return decode<T>(response);
 }
 async csrf() {
  const {token} = await this.get<{token:string}>('/auth/csrf');
  if (typeof token !== 'string' || !token) throw new ApiError(0, 'Could not obtain a security token. Please retry.');
  this.token = token;
 }
 async post<T>(path: string, body?: unknown): Promise<T> {
  if (!this.token) await this.csrf();
  const response = await fetch(`/api${path}`, {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':this.token!},body:body === undefined ? undefined : JSON.stringify(body)});
  return decode<T>(response);
 }
 async authenticate(mode: 'login'|'bootstrap', body: unknown) {
  await this.post(`/auth/${mode}`, body);
  this.token = undefined;
  // Authentication already succeeded. Let the UI recheck session/setup even if
  // token refresh fails; post() will reacquire the token before the next write.
  await this.csrf().catch(() => undefined);
 }
}
