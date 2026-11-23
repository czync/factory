/**
 * Real Web Crypto SHA-256 hashing utilities for:
 * - WP-00 Golden Master S3 WORM baseline sealing
 * - Artifactory Release Artifact SHA-256 reconciliation (UAT === PROD)
 * - Append-only hash-chained AuditEvent ledger verification
 */

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function shortHash(hash: string, len = 12): string {
  if (!hash) return '—';
  return hash.slice(0, len);
}
