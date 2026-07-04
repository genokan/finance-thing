import { describe, it, expect, beforeEach } from 'vitest'
import { encrypt, decrypt } from './crypto'

const KEY = 'a'.repeat(64)

describe('crypto (AES-256-GCM)', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY
  })

  it('round-trips plaintext', () => {
    const secret = 'access-sandbox-1234-secret-token'
    expect(decrypt(encrypt(secret))).toBe(secret)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'))
  })

  it('rejects tampered ciphertext (auth tag)', () => {
    const c = encrypt('secret')
    // Flip a nibble in the encrypted payload region (after IV + tag = 56 hex chars).
    const tampered = c.slice(0, 60) + (c[60] === '0' ? '1' : '0') + c.slice(61)
    expect(() => decrypt(tampered)).toThrow()
  })

  it('rejects a missing or malformed key', () => {
    process.env.ENCRYPTION_KEY = 'too-short'
    expect(() => encrypt('x')).toThrow(/64-character hex/)
    delete process.env.ENCRYPTION_KEY
    expect(() => encrypt('x')).toThrow(/64-character hex/)
  })

  it('decrypting with a different key fails', () => {
    const c = encrypt('secret')
    process.env.ENCRYPTION_KEY = 'b'.repeat(64)
    expect(() => decrypt(c)).toThrow()
  })
})
