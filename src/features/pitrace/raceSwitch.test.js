import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSwitcher, SETTLE_MS, SWITCH_MS } from './raceSwitch.js'
import { createVoskRuntime } from '../../shared/lib/vosk/voskRuntime.js'
import { runtimeOf, voskRuntimeRu, acquireModel } from '../../shared/lib/vosk/voskRuntimes.js'
import { voskRuntime } from '../../shared/lib/vosk/voskRuntime.js'

// Переключение слуха между английской и русской моделями Vosk (raceSwitch.js): порядок вызовов, пауза между выгрузкой и загрузкой, отказ русской, очередь переключений.
const tick = () => new Promise(r => setTimeout(r, 0))

/** Поддельный прогрев модели: журнал вызовов в общий массив */
function fakeRuntime(name, log, { ok = true } = {}) {
  return {
    evict: why => { log.push(`${name}.evict`); return !!why },
    acquire: () => { log.push(`${name}.acquire`); return () => log.push(`${name}.release`) },
    whenSettled: async () => { log.push(`${name}.whenSettled`); return ok ? { ok: true } : { ok: false, reason: 'failed', text: 'не открылась' } },
    expect: on => log.push(`${name}.expect(${on})`),
    warmNow: t => log.push(`${name}.warmNow(${t})`),
  }
}
const immediate = fn => { fn(); return 0 } // «время» не ждём: пауза между моделями проверяется по вызову sleep, не по таймеру

describe('переключатель слуха: английская → русская → английская', () => {
  it('перед русской проходом английская выгружается ДО загрузки русской (две модели вместе в памяти не живут); пауза между ними; русская ждёт готовности', async () => {
    const log = [], pauses = []
    const sw = createSwitcher({ en: fakeRuntime('en', log), ru: fakeRuntime('ru', log), setTimer: (fn, ms) => { pauses.push(ms); return immediate(fn) } })
    expect(sw.state()).toBe('en')
    const r = await sw.toRu()
    expect(r).toEqual({ ok: true }); expect(sw.state()).toBe('ru')
    expect(log).toEqual(['ru.expect(true)', 'en.evict', 'ru.acquire', 'ru.whenSettled', 'ru.expect(false)'])
    expect(log.indexOf('en.evict')).toBeLessThan(log.indexOf('ru.acquire'))
    expect(pauses).toEqual([SETTLE_MS]) // выгрузка английской стирает общую базу IndexedDB с задержкой — русская начинает позже
    expect(await sw.toRu()).toEqual({ ok: true }) // уже русская — ничего не повторяется
    expect(log.filter(x => x === 'en.evict')).toHaveLength(1)
  })
  it('после русского прохода: русская отпущена и выгружена, английская возвращена после паузы (warmNow)', async () => {
    const log = []
    const sw = createSwitcher({ en: fakeRuntime('en', log), ru: fakeRuntime('ru', log), setTimer: immediate })
    await sw.toRu(); log.length = 0
    await sw.toEn('итог')
    expect(log).toEqual(['en.expect(true)', 'ru.release', 'ru.evict', 'en.warmNow(switch)', 'en.expect(false)'])
    expect(sw.state()).toBe('en')
    log.length = 0; await sw.toEn('ещё раз'); expect(log).toEqual([]) // уже английская
  })
  it('русская не включилась: английская возвращается, результат { ok: false } — директор переводит проход на тап', async () => {
    const log = []
    const sw = createSwitcher({ en: fakeRuntime('en', log), ru: fakeRuntime('ru', log, { ok: false }), setTimer: immediate })
    const r = await sw.toRu()
    expect(r.ok).toBe(false); expect(r.text).toBe('не открылась'); expect(sw.state()).toBe('en')
    expect(log).toContain('ru.release'); expect(log).toContain('en.warmNow(switch)'); expect(log.indexOf('ru.evict')).toBeLessThan(log.indexOf('en.warmNow(switch)'))
    expect(log.at(-1)).toBe('ru.expect(false)') // слушатель прохода B ждёт модель до конца переключения: «нет модели» раньше перевода прохода на тап не прозвучит
  })
  it('переключения идут по очереди: «назад» не перебивает идущее «вперёд»', async () => {
    const log = []
    const sw = createSwitcher({ en: fakeRuntime('en', log), ru: fakeRuntime('ru', log), setTimer: (fn, ms) => { setTimeout(fn, 1); return ms } })
    const a = sw.toRu(), b = sw.toEn('выход')
    expect(sw.pendingMs()).toBeGreaterThanOrEqual(0)
    await a; await b
    expect(log.indexOf('ru.acquire')).toBeLessThan(log.indexOf('ru.release')); expect(sw.state()).toBe('en')
    await tick()
  })
  it('пока идёт переключение, пилюли ждут (pendingMs > 0), потом нет', async () => {
    const sw = createSwitcher({ en: fakeRuntime('en', []), ru: fakeRuntime('ru', []), setTimer: (fn) => { setTimeout(fn, 5); return 0 } })
    const p = sw.toRu()
    await tick(); expect(sw.pendingMs()).toBeGreaterThan(0)
    await p; expect(sw.pendingMs()).toBe(0)
  })
  it('плашка переключения короче полутора секунд', () => { expect(SWITCH_MS).toBeLessThanOrEqual(1500) })
})

describe('прогрев по языкам и выгрузка по требованию (voskRuntime)', () => {
  it('runtimeOf: ru — отдельный прогрев со своим адресом, en — основной; acquireModel(why, lang) занимает нужный', () => {
    expect(runtimeOf('ru')).toBe(voskRuntimeRu); expect(runtimeOf('en')).toBe(voskRuntime); expect(runtimeOf()).toBe(voskRuntime); expect(voskRuntimeRu).not.toBe(voskRuntime)
    const rel = vi.spyOn(voskRuntimeRu, 'acquire').mockReturnValue(() => {})
    acquireModel('race', 'ru'); expect(rel).toHaveBeenCalledWith('race'); rel.mockRestore()
  })
  it('evict выгружает модель даже у держателей, expect() виден в снимке; checkCached смотрит кэш без загрузки в память', async () => {
    const unload = vi.fn(), peek = vi.fn(async () => ({ size: 1 }))
    const rt = createVoskRuntime({ url: () => 'u', unload, peek, read: async () => null, mode: () => 'vosk', watchCached: () => () => {}, setTimer: () => 0, clearTimer: () => {}, log: () => {} })
    expect(rt.evict()).toBe(false) // выгружать нечего
    expect(rt.snapshot().expecting).toBe(false); rt.expect(true); expect(rt.snapshot().expecting).toBe(true); rt.expect(false)
    expect(await rt.checkCached()).toBe(true); expect(peek).toHaveBeenCalledWith('u'); expect(rt.snapshot().loaded).toBe(false)
  })
  it('в блоке прогрева не появилось сети и Math.random (чистая логика переключения)', () => {
    expect(readFileSync(new URL('./raceSwitch.js', import.meta.url), 'utf8')).not.toMatch(/Math\.random|fetch\(/)
  })
})
