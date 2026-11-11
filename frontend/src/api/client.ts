import { API_URL, request } from './http';
export const BASE_URL = API_URL+'/auth';
export function apiFetcher<T>(endpoint:string,options:RequestInit & {token?:string}={}) {
  const {token,...rest}=options;
  return request<T>('/auth'+endpoint,rest,Boolean(token));
}
