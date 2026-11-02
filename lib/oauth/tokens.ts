import { configManager } from '@/lib/admin/config-manager';
import { DEFAULT_OAUTH_SCOPES } from './scopes';

/**
 * Resolve the OAuth scopes to request at authorize time.
 *
 * Reads admin override / OAUTH_SCOPES / OAUTH_EXTRA_SCOPES at call time so
 * runtime env vars (and admin dashboard changes) take effect without a rebuild.
 * Server-only: callers in the browser must read `oauthScopes` from /api/config.
 */
export function getOauthScopes(): string {
  const explicit = configManager.get<string>('oauthScopes', '');
  if (explicit) return explicit;
  const extra = configManager.get<string>('oauthExtraScopes', '');
  return extra ? `${DEFAULT_OAUTH_SCOPES} ${extra}`.trim() : DEFAULT_OAUTH_SCOPES;
}
export const REFRESH_TOKEN_COOKIE = 'jmap_rt';
export const REFRESH_TOKEN_SERVER_COOKIE = 'jmap_rts';
export const ACCESS_TOKEN_COOKIE = 'jmap_at';

/** Get the cookie name for a given account slot. Slot 0 uses the legacy name. */
export function refreshTokenCookieName(slot: number): string {
  return slot === 0 ? REFRESH_TOKEN_COOKIE : `${REFRESH_TOKEN_COOKIE}_${slot}`;
}

/** Companion cookie storing which server entry id minted the refresh token at this slot. */
export function refreshTokenServerCookieName(slot: number): string {
  return slot === 0 ? REFRESH_TOKEN_SERVER_COOKIE : `${REFRESH_TOKEN_SERVER_COOKIE}_${slot}`;
}

/**
 * Path the cached access token is scoped to.
 *
 * Only `/api/auth/token` reads it: the cookie is httpOnly, so no client code
 * can, and no other route touches it. Stored at `Path=/` it rode every page
 * load, every RSC fetch and every asset request instead - one multi-kilobyte
 * JWT per signed-in account, on every request. That is what pushed a
 * multi-account browser's Cookie header into the edge's buffer limit and into
 * Node's 16 KiB request-header cap, so the whole jar had to be given room it
 * should never have needed. Scoping it to the one route that reads it takes it
 * out of the request path entirely, the way the id token already is; the
 * cookie still expires with the token it caches.
 */
export function accessTokenCookiePath(basePath?: string): string {
  return `${basePath ?? ''}/api/auth/token`;
}

/**
 * Cookie caching the *current* access token for a slot, so a page reload can
 * resume with the token it already had instead of burning a refresh.
 */
export function accessTokenCookieName(slot: number): string {
  return slot === 0 ? ACCESS_TOKEN_COOKIE : `${ACCESS_TOKEN_COOKIE}_${slot}`;
}

/**
 * Seconds of remaining life an access token must have for the cache to serve
 * it. Mirrors the client's refresh-ahead margin: inside this window the token
 * is due for renewal anyway, and IdPs that gate refresh on an `nbf` claim
 * (Rauthy sets `iat + access_token_lifetime - 60`) have opened by then.
 */
export const ACCESS_TOKEN_MIN_REMAINING_SECONDS = 60;

/**
 * Cap on the cached value. Browsers cap a cookie at ~4096 bytes including the
 * name and attributes; an access token above this is dropped from the cache
 * rather than silently truncated, degrading to a refresh-on-reload.
 */
const MAX_CACHED_ACCESS_TOKEN_BYTES = 3300;

/** Serialise an access token plus its absolute expiry for cookie storage. */
export function encodeCachedAccessToken(token: string, expiresInSeconds: number): string | null {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const value = `${expiresAt}.${token}`;
  if (value.length > MAX_CACHED_ACCESS_TOKEN_BYTES) return null;
  return value;
}

/**
 * Parse a cached access token, returning it only when it still has at least
 * {@link ACCESS_TOKEN_MIN_REMAINING_SECONDS} of life left.
 */
export function decodeCachedAccessToken(
  value: string | undefined,
): { accessToken: string; expiresIn: number } | null {
  if (!value) return null;
  const sep = value.indexOf('.');
  if (sep <= 0) return null;
  const expiresAt = parseInt(value.slice(0, sep), 10);
  const accessToken = value.slice(sep + 1);
  if (!Number.isFinite(expiresAt) || !accessToken) return null;
  const expiresIn = expiresAt - Math.floor(Date.now() / 1000);
  if (expiresIn < ACCESS_TOKEN_MIN_REMAINING_SECONDS) return null;
  return { accessToken, expiresIn };
}
