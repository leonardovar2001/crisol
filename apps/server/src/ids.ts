import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short, readable, prefixed identifiers: `esc_k3f9a2xq`. */
export function newId(prefix: string, length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Opaque, high-entropy token for cookies. Never derived from anything guessable. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
