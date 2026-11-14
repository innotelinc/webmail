import { describe, expect, it } from 'vitest';
import { totpIssuer } from '../totp-issuer';

describe('totpIssuer', () => {
  it('uses the configured app name', () => {
    expect(totpIssuer('Acme Mail')).toBe('Acme Mail');
  });

  it('keeps Stalwart on a stock install', () => {
    expect(totpIssuer('Mail')).toBe('Stalwart');
    expect(totpIssuer('')).toBe('Stalwart');
    expect(totpIssuer('  ')).toBe('Stalwart');
    expect(totpIssuer(undefined)).toBe('Stalwart');
  });
});
