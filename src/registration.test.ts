import { describe, expect, it } from 'vitest';
import { parseAuthStatus, registrationAvailable } from './registration';
describe('registration status fails closed', () => {
 it('strictly validates the entire status contract', () => {
  for (const status of [null, [], {}, {requiresBootstrap:'false',registrationAvailable:true}, {requiresBootstrap:'true',registrationAvailable:false}, {requiresBootstrap:1,registrationAvailable:false}, {requiresBootstrap:false}, {requiresBootstrap:true,registrationAvailable:true}, {requiresBootstrap:false,registrationAvailable:'true'}]) expect(() => parseAuthStatus(status)).toThrow();
  for (const status of [{requiresBootstrap:true,registrationAvailable:false},{requiresBootstrap:false,registrationAvailable:true},{requiresBootstrap:false,registrationAvailable:false}]) expect(parseAuthStatus(status)).toEqual(status);
 });
 it('requires an explicit true and a completed bootstrap', () => {
  expect(registrationAvailable({requiresBootstrap:false,registrationAvailable:true})).toBe(true);
  for(const status of [{requiresBootstrap:true,registrationAvailable:true},{requiresBootstrap:false},{requiresBootstrap:false,registrationAvailable:'true'},{requiresBootstrap:false,registrationAvailable:false}]) expect(registrationAvailable(status)).toBe(false);
 });
});
