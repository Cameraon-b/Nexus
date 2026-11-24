export function parseAuthStatus(value: unknown): {requiresBootstrap:boolean; registrationAvailable:boolean} {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid auth status');
 const status = value as Record<string, unknown>;
 if (typeof status.requiresBootstrap !== 'boolean' || typeof status.registrationAvailable !== 'boolean' || (status.requiresBootstrap && status.registrationAvailable)) throw new Error('Invalid auth status');
 return {requiresBootstrap:status.requiresBootstrap, registrationAvailable:status.registrationAvailable};
}
export function registrationAvailable(status: unknown): boolean {
 try { const parsed = parseAuthStatus(status); return !parsed.requiresBootstrap && parsed.registrationAvailable; }
 catch { return false; }
}
