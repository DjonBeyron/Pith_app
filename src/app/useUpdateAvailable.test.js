import { describe, it, expect } from 'vitest'
import { decideUpdate } from './useUpdateAvailable.js'

// Когда плашка «Доступна новая версия» берётся из опроса /version.json (основной путь — сообщение service worker'а, см. shellClient.js)
describe('decideUpdate: опрос version.json', () => {
  const base = { appVersion: '3.2.1', shellActive: false, mismatches: 0 }

  it('версии совпали или ответа нет — ничего, счётчик с нуля', () => {
    expect(decideUpdate({ ...base, netVersion: '3.2.1', mismatches: 1 })).toEqual({ how: null, mismatches: 0 })
    expect(decideUpdate({ ...base, netVersion: undefined })).toEqual({ how: null, mismatches: 0 })
  })

  it('кеша оболочки нет (dev, воркер выключен): новая версия в сети — плашка сразу, reload пойдёт с сети', () => {
    expect(decideUpdate({ ...base, netVersion: '3.2.2' }).how).toBe('poll')
  })

  it('кеш оболочки есть: версию должен доставить воркер; опрос — только запасной путь после двух проверок подряд ("stuck")', () => {
    const first = decideUpdate({ ...base, netVersion: '3.2.2', shellActive: true })
    expect(first).toEqual({ how: null, mismatches: 1 })
    expect(decideUpdate({ ...base, netVersion: '3.2.2', shellActive: true, mismatches: first.mismatches }).how).toBe('stuck')
  })

  it('воркер успел поставить новую версию (опрос совпал) — счётчик «застряло» сбрасывается', () => {
    expect(decideUpdate({ ...base, netVersion: '3.2.1', shellActive: true, mismatches: 1 }).mismatches).toBe(0)
  })
})
