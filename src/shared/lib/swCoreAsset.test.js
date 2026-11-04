import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

// Решения воркера по /assets/* (public/sw-core.js): годен ли ответ из кеша, что делать с негодным, drop-asset
const ctx = {}
vm.runInNewContext(readFileSync(resolve(import.meta.dirname, '../../../public/sw-core.js'), 'utf8'), ctx)
const C = ctx.PithySwCore
const ok = ct => ({ ok: true, redirected: false, ct })

describe('sw-core: assetHit', () => {
  it('нет попадания — ничего не делаем', () => {
    expect(C.assetHit('/assets/a.js', null)).toEqual({ use: false, drop: false, reload: false })
  })
  it('годный js/css — отдаём из кеша', () => {
    expect(C.assetHit('/assets/a.js', ok('text/javascript')).use).toBe(true)
    expect(C.assetHit('/assets/a.css', ok('text/css')).use).toBe(true)
  })
  it('js как text/html — негоден: удалить, в сеть мимо HTTP-кеша', () => {
    expect(C.assetHit('/assets/vosk-x.js', ok('text/html; charset=utf-8'))).toEqual({ use: false, drop: true, reload: true })
  })
  it('не 200 и редирект — негодны', () => {
    expect(C.assetHit('/assets/a.js', { ok: false, redirected: false, ct: 'text/javascript' }).drop).toBe(true)
    expect(C.assetHit('/assets/a.js', { ok: true, redirected: true, ct: 'text/javascript' }).drop).toBe(true)
  })
  it('в кеш кладём только годный ответ', () => {
    expect(C.assetStorable('/assets/a.js', ok('text/html'))).toBe(false)
    expect(C.assetStorable('/assets/a.js', ok('text/javascript'))).toBe(true)
    expect(C.assetStorable('/assets/a.js', null)).toBe(false)
  })
})

describe('sw-core: drop-asset и запасной адрес', () => {
  it('префикс только внутри /assets/', () => {
    expect(C.matchesDropPrefix('/assets/vosk-Cza5.js', '/assets/vosk-')).toBe(true)
    expect(C.matchesDropPrefix('/assets/index-1.js', '/assets/vosk-')).toBe(false)
    expect(C.matchesDropPrefix('/net-guard.js', '/')).toBe(false)
    expect(C.matchesDropPrefix('/assets/a.js', undefined)).toBe(false)
  })
  it('/vosk-fallback.js воркер не перехватывает (не предзагружен — other)', () => {
    const r = { pathname: '/vosk-fallback.js', search: '?v=1', sameOrigin: true, method: 'GET', mode: 'no-cors', cache: 'default' }
    expect(C.route(r, new Set(['/net-guard.js']))).toBe('other')
  })
})
