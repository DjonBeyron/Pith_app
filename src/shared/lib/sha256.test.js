import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256Hex } from './sha256.js'

// Синхронный SHA-256 (hash озвучки сцен) против эталона node:crypto, включая UTF-8 и
// границы блока (55/56/64 байта — где падение паддинга проявляется сразу)
describe('sha256Hex', () => {
  it('совпадает с node:crypto на пустой строке, ASCII, кириллице и границах блока', () => {
    for (const s of ['', 'abc', 'Привет, мир!', 'x'.repeat(200), 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'ё'.repeat(31)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'))
    }
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('hex из 64 символов; null/undefined — как пустая строка', () => {
    expect(sha256Hex('что угодно')).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex(null)).toBe(sha256Hex(''))
  })
})
